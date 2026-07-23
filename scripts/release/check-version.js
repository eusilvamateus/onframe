const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const packageJson = readJson('package.json');
const manifest = readJson(path.join('extension', 'manifest.json'));
const expectedTag = process.argv[2] || process.env.GITHUB_REF_NAME || '';

main();

function main() {
  const version = String(packageJson.version || '').trim();
  const manifestVersion = String(manifest.version || '').trim();

  assertSemver(version, 'package.json');
  assertSemver(manifestVersion, 'extension/manifest.json');

  if (version !== manifestVersion) {
    fail(`Versoes divergentes: package.json=${version}, manifest.json=${manifestVersion}.`);
  }

  if (expectedTag) {
    const normalizedTag = expectedTag.startsWith('refs/tags/')
      ? expectedTag.slice('refs/tags/'.length)
      : expectedTag;
    if (normalizedTag !== `v${version}`) {
      fail(`Tag ${normalizedTag} nao corresponde a versao v${version}.`);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    version,
    tag: `v${version}`
  }, null, 2));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function assertSemver(value, source) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) {
    fail(`${source} precisa usar MAJOR.MINOR.PATCH, recebido: ${value || '(vazio)'}.`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
