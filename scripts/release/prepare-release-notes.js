const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_REPO_URL = 'https://github.com/eusilvamateus/onframe';

if (require.main === module) {
  main();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tag = normalizeTag(args.tag || process.env.GITHUB_REF_NAME || '');
  const output = args.output || path.join(ROOT, 'dist', `release-notes-${tag || 'release'}.md`);

  if (!tag) {
    fail('Informe a tag da release, por exemplo: v0.3.2.');
  }

  const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
  const previousTag = args.previousTag || findPreviousTag(tag, ROOT);
  const notes = buildReleaseNotes({
    tag,
    previousTag,
    changelog,
    repoUrl: args.repoUrl || DEFAULT_REPO_URL
  });

  fs.mkdirSync(path.dirname(path.resolve(ROOT, output)), { recursive: true });
  fs.writeFileSync(path.resolve(ROOT, output), `${notes}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    tag,
    previousTag: previousTag || null,
    output
  }, null, 2));
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--output') {
      args.output = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === '--previous') {
      args.previousTag = normalizeTag(argv[index + 1] || '');
      index += 1;
      continue;
    }
    if (value === '--repo-url') {
      args.repoUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (!args.tag) {
      args.tag = value;
    }
  }

  return args;
}

function buildReleaseNotes({ tag, previousTag, changelog, repoUrl = DEFAULT_REPO_URL }) {
  const normalizedTag = normalizeTag(tag);
  const normalizedPrevious = normalizeTag(previousTag || '');
  const section = extractChangelogSection(changelog, normalizedTag);
  const releaseBody = stripVersionHeading(section).trim() || [
    '## Changes',
    '',
    `- Release ${normalizedTag}.`
  ].join('\n');
  const previousLine = normalizedPrevious
    ? `- Previous release: [\`${normalizedPrevious}\`](${repoUrl}/releases/tag/${normalizedPrevious})`
    : '- Previous release: none';
  const compareLine = normalizedPrevious
    ? `- Compare: [\`${normalizedPrevious}...${normalizedTag}\`](${repoUrl}/compare/${normalizedPrevious}...${normalizedTag})`
    : '- Compare: unavailable';

  return [
    `# OnFrame ${normalizedTag}`,
    '',
    `- Version: \`${normalizedTag}\``,
    previousLine,
    compareLine,
    '',
    releaseBody
  ].join('\n');
}

function extractChangelogSection(changelog, tag) {
  const lines = String(changelog || '').split(/\r?\n/);
  const pattern = new RegExp(`^##\\s+${escapeRegExp(tag)}(\\s|-|$)`);
  const start = lines.findIndex((line) => pattern.test(line));

  if (start < 0) return '';

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join('\n').trim();
}

function stripVersionHeading(section) {
  const lines = String(section || '').split(/\r?\n/);
  if (!/^##\s+/.test(lines[0] || '')) return String(section || '');
  const body = lines.slice(1);
  while (body[0] === '') body.shift();
  return body.join('\n');
}

function findPreviousTag(tag, cwd = ROOT) {
  const current = parseSemverTag(tag);
  if (!current) return '';

  const result = spawnSync('git', ['tag', '--list', 'v*.*.*'], {
    cwd,
    encoding: 'utf8'
  });

  if (result.status !== 0) return '';

  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== tag)
    .filter((item) => {
      const parsed = parseSemverTag(item);
      return parsed && compareSemver(parsed, current) < 0;
    })
    .sort((left, right) => compareSemver(parseSemverTag(right), parseSemverTag(left)))[0] || '';
}

function parseSemverTag(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(tag || '').trim());
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

function compareSemver(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function normalizeTag(tag) {
  const value = String(tag || '').trim();
  if (value.startsWith('refs/tags/')) return value.slice('refs/tags/'.length);
  return value;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

module.exports = {
  buildReleaseNotes,
  extractChangelogSection,
  findPreviousTag,
  parseSemverTag,
  stripVersionHeading
};
