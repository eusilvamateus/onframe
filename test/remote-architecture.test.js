const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('a distribuição não inclui servidor, configuração de token ou documentação interna', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'release', 'package-release.js'), 'utf8');
  assert.match(source, /'extension'/);
  assert.match(source, /'scripts\/bootstrap'/);
  assert.doesNotMatch(source, /'service'/);
  assert.doesNotMatch(source, /\.env\.example/);
  assert.match(source, /child === 'docs'/);
});

test('domínio comercial pertence ao Worker e é compatível com a suíte Node', () => {
  const contracts = fs.readFileSync(path.join(root, 'cloudflare', 'src', 'legacy-contracts.ts'), 'utf8');
  const moduleType = JSON.parse(fs.readFileSync(path.join(root, 'cloudflare', 'src', 'domain', 'package.json'), 'utf8'));
  assert.equal(moduleType.type, 'commonjs');
  assert.match(contracts, /\.\/domain\/account-client\.js/);
  assert.match(contracts, /\.\/domain\/routes\/promotions\.js/);
  assert.equal(fs.existsSync(path.join(root, 'service')), false);
});

test('bootstrap preserva instalação e atualização, sem ciclo de serviço', () => {
  const bootstrap = path.join(root, 'scripts', 'bootstrap');
  const expected = [
    'install.ps1',
    'install.sh',
    'update.ps1',
    'update.sh',
    'onframe-updater.ps1',
    'register-updater-protocol.ps1',
    'register-updater-protocol.sh',
    'unregister-updater-protocol.ps1',
    'unregister-updater-protocol.sh',
    'uninstall.ps1',
    'uninstall.sh'
  ];
  for (const file of expected) assert.equal(fs.existsSync(path.join(bootstrap, file)), true, file);
  for (const file of ['start.ps1', 'stop.ps1', 'restart.ps1', 'check.ps1', 'common.ps1', 'launcher-action.sh']) {
    assert.equal(fs.existsSync(path.join(bootstrap, file)), false, file);
  }
});
