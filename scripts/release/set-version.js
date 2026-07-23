const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const nextVersion = String(process.argv[2] || '').trim();

main();

function main() {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(nextVersion)) {
    console.error('Uso: npm run version:set -- 0.1.1');
    console.error('A versao precisa usar MAJOR.MINOR.PATCH.');
    process.exit(1);
  }

  updateJson('package.json', (json) => {
    json.version = nextVersion;
    return json;
  });

  updateJson(path.join('extension', 'manifest.json'), (json) => {
    json.version = nextVersion;
    return json;
  });

  console.log(JSON.stringify({
    ok: true,
    version: nextVersion,
    tag: `v${nextVersion}`
  }, null, 2));
}

function updateJson(relativePath, updater) {
  const filePath = path.join(ROOT, relativePath);
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const updated = updater(json);
  fs.writeFileSync(filePath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
}
