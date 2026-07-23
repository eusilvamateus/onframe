const path = require('path');
const packageJson = require('../../package.json');

const DEFAULT_REPO = 'eusilvamateus/onframe';
const DEFAULT_BRANCH = 'main';
const CACHE_MS = 5 * 60 * 1000;

function createUpdateManager(options = {}) {
  const env = options.env || process.env;
  const root = options.root || path.resolve(__dirname, '..', '..');
  const fetchImpl = options.fetchImpl || fetch;
  const nowImpl = options.nowImpl || (() => Date.now());
  const currentVersion = options.currentVersion || packageJson.version;
  const repo = env.ONFRAME_UPDATE_REPO || DEFAULT_REPO;
  const branch = env.ONFRAME_UPDATE_BRANCH || DEFAULT_BRANCH;
  const channel = normalizeChannel(env.ONFRAME_UPDATE_CHANNEL);
  const updateScriptUrl = env.ONFRAME_UPDATE_SCRIPT_URL || buildDefaultScriptUrl(repo, branch, 'update.ps1');
  const checkScriptUrl = env.ONFRAME_CHECK_SCRIPT_URL || buildDefaultScriptUrl(repo, branch, 'check.ps1');
  let cache = null;

  return {
    getStatus
  };

  async function getStatus(options = {}) {
    const base = {
      ok: true,
      currentVersion,
      currentTag: `v${currentVersion}`,
      channel,
      repo,
      scriptUrl: updateScriptUrl,
      updateScriptUrl,
      checkScriptUrl,
      latestVersion: null,
      latestTag: null,
      releaseUrl: null,
      assetName: null,
      updateAvailable: false,
      canUpdate: false,
      updateCommand: buildUpdateCommand({ root, scriptUrl: updateScriptUrl }),
      checkCommand: buildBootstrapCommand({ root, scriptUrl: checkScriptUrl }),
      message: '',
      checkedAt: new Date(nowImpl()).toISOString()
    };

    const latest = await getLatestRelease({ force: options.force });
    if (!latest) {
      return Object.assign(base, {
        reason: 'no_release',
        message: 'Nenhuma release encontrada.'
      });
    }

    const latestVersion = tagToVersion(latest.tag_name);
    const updateAvailable = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;

    return Object.assign(base, {
      latestVersion,
      latestTag: latest.tag_name,
      releaseUrl: latest.html_url || null,
      assetName: latest.asset ? latest.asset.name : null,
      updateAvailable,
      canUpdate: updateAvailable,
      reason: updateAvailable ? 'copy_command' : 'up_to_date',
      message: updateAvailable ? `Versão ${latestVersion} disponível.` : 'OnFrame atualizado.'
    });
  }

  async function getLatestRelease(options = {}) {
    if (!options.force && cache && cache.expiresAt > nowImpl()) return cache.release;
    const release = await fetchLatestRelease(fetchImpl, repo, channel, env.GITHUB_TOKEN || env.GH_TOKEN);
    cache = { release, expiresAt: nowImpl() + CACHE_MS };
    return release;
  }
}

async function fetchLatestRelease(fetchImpl, repo, channel, token) {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=30`, {
    headers: buildGitHubHeaders(token)
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : [];
  if (!response.ok) {
    const err = new Error(`update_release_lookup_failed: GitHub respondeu HTTP ${response.status}.`);
    err.statusCode = response.status;
    err.body = body;
    throw err;
  }
  const releases = Array.isArray(body) ? body : [];
  return releases
    .filter((release) => !release.draft)
    .filter((release) => channel === 'preview' || !release.prerelease)
    .map((release) => Object.assign({}, release, { asset: pickReleaseAsset(release) }))
    .find((release) => tagToVersion(release.tag_name) && release.asset) || null;
}

function buildGitHubHeaders(token) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'onframe-updater'
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function pickReleaseAsset(release) {
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  return assets.find((asset) => /^onframe-release-v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.zip$/i.test(asset.name || '')) ||
    assets.find((asset) => /^onframe-release-.*\.zip$/i.test(asset.name || '')) ||
    assets.find((asset) => /\.zip$/i.test(asset.name || '')) ||
    null;
}

function buildDefaultScriptUrl(repo, branch, scriptName = 'update.ps1') {
  return `https://raw.githubusercontent.com/${repo}/${branch}/scripts/bootstrap/${scriptName}`;
}

function buildBootstrapCommand({ root, scriptUrl }) {
  return `$env:ONFRAME_HOME='${escapePowerShellSingleQuoted(root)}'; iwr -useb '${escapePowerShellSingleQuoted(scriptUrl)}' | iex`;
}

function buildUpdateCommand({ root, scriptUrl }) {
  return buildBootstrapCommand({ root, scriptUrl });
}

function normalizeChannel(value) {
  const channel = String(value || 'stable').trim().toLowerCase();
  return channel === 'preview' ? 'preview' : 'stable';
}

function tagToVersion(tag) {
  const match = String(tag || '').trim().match(/^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/);
  return match ? match[1] : null;
}

function compareVersions(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return 0;
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] > b[key]) return 1;
    if (a[key] < b[key]) return -1;
  }
  if (!a.pre && !b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return comparePrerelease(a.pre, b.pre);
}

function parseSemver(version) {
  const match = String(version || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] || ''
  };
}

function comparePrerelease(left, right) {
  const a = left.split('.');
  const b = right.split('.');
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] === undefined) return -1;
    if (b[index] === undefined) return 1;
    const leftNumber = Number(a[index]);
    const rightNumber = Number(b[index]);
    const bothNumeric = Number.isInteger(leftNumber) && Number.isInteger(rightNumber);
    if (bothNumeric && leftNumber !== rightNumber) return leftNumber > rightNumber ? 1 : -1;
    if (!bothNumeric && a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function escapePowerShellSingleQuoted(value) {
  return String(value || '').replace(/'/g, "''");
}

module.exports = {
  buildBootstrapCommand,
  compareVersions,
  createUpdateManager,
  tagToVersion
};
