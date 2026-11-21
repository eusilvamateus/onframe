const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const extensionDir = path.join(root, 'extension');
const version = require(path.join(root, 'package.json')).version;
const distDir = path.join(root, 'dist');
const stagingDir = path.join(distDir, `onframe-store-v${version}`);
const zipPath = path.join(distDir, `onframe-store-v${version}.zip`);

fs.mkdirSync(distDir, { recursive: true });
fs.rmSync(stagingDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.cpSync(extensionDir, stagingDir, { recursive: true });

try {
  for (const file of ['manifest.json', 'background.js', 'ui/options/app.js', 'ui/popup/app.js']) {
    if (!fs.existsSync(path.join(stagingDir, file))) throw new Error(`Arquivo ausente no pacote: ${file}`);
  }

  const entries = fs.readdirSync(stagingDir);
  const command = process.platform === 'win32' ? 'tar' : 'zip';
  const args =
    process.platform === 'win32'
      ? ['-a', '-c', '-f', zipPath, '-C', stagingDir, ...entries]
      : ['-r', '-q', zipPath, ...entries];
  const result = spawnSync(command, args, { cwd: stagingDir, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falha ao compactar a extensão (${result.status}).`);

  console.log(`Pacote para a Chrome Web Store criado: ${zipPath}`);
} finally {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
