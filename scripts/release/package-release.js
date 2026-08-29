const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const packageJson = require(path.join(root, 'package.json'));
const version = packageJson.version;
const distDir = path.join(root, 'dist');
const packageDir = path.join(distDir, `onframe-v${version}`);
const zipPath = path.join(distDir, `onframe-v${version}.zip`);

const entries = [
  'extension',
  'service',
  'scripts',
  'docs',
  'package.json',
  'package-lock.json',
  'README.md',
  'CHANGELOG.md',
  'RELEASE.md',
  '.env.example'
];

fs.rmSync(packageDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(packageDir, { recursive: true });

for (const entry of entries) {
  const source = path.join(root, entry);
  if (!fs.existsSync(source)) continue;
  copyRecursive(source, path.join(packageDir, entry));
}

const compress = createZipArchive();

if (compress.status !== 0) {
  process.exit(compress.status || 1);
}

console.log(`Pacote criado: ${zipPath}`);

function copyRecursive(source, destination) {
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const child of fs.readdirSync(source)) {
      if (child === 'node_modules' || child === 'dist' || child === '.git' || child === '.onframe') continue;
      copyRecursive(path.join(source, child), path.join(destination, child));
    }
    return;
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function createZipArchive() {
  if (process.platform === 'darwin') {
    return spawnSync('ditto', ['-c', '-k', '--keepParent', packageDir, zipPath], {
      cwd: root,
      stdio: 'inherit'
    });
  }
  if (process.platform === 'win32') {
    return spawnSync('tar', ['-a', '-c', '-f', zipPath, '-C', distDir, path.basename(packageDir)], {
      cwd: root,
      stdio: 'inherit'
    });
  }
  return spawnSync('zip', ['-r', '-q', zipPath, path.basename(packageDir)], {
    cwd: distDir,
    stdio: 'inherit'
  });
}
