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

test('promoções pendentes usam Workflow durável e reconciliação consultável', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'cloudflare', 'wrangler.jsonc'), 'utf8'));
  const worker = fs.readFileSync(path.join(root, 'cloudflare', 'src', 'remote-api.ts'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, 'cloudflare', 'src', 'promotion-reconciliation-workflow.ts'), 'utf8');
  const extension = fs.readFileSync(path.join(root, 'extension', 'modules', 'commerce', 'module.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'cloudflare', 'migrations', '0011_promotion_reconciliations.sql'), 'utf8');

  assert.deepEqual(config.workflows, [{
    name: 'onframe-promotion-reconciliation',
    binding: 'PROMOTION_RECONCILIATION',
    class_name: 'PromotionReconciliationWorkflow'
  }]);
  assert.equal(config.main, 'src/worker.ts');
  assert.match(workflow, /class PromotionReconciliationWorkflow extends WorkflowEntrypoint/);
  assert.match(worker, /GET \/bulk\/reconciliations/);
  assert.match(worker, /PROMOTION_RECONCILIATION\.create/);
  assert.match(extension, /\/api\/bulk\/reconciliations\?ids=/);
  assert.match(migration, /CREATE TABLE promotion_reconciliations/);
  assert.match(migration, /idx_item_edit_events_idempotent/);
});

test('bootstrap preserva instalação e atualização, sem ciclo de serviço', () => {
  const bootstrap = path.join(root, 'scripts', 'bootstrap');
  const installMac = fs.readFileSync(path.join(bootstrap, 'install.sh'), 'utf8');
  const updateMac = fs.readFileSync(path.join(bootstrap, 'update.sh'), 'utf8');
  const macIntegration = fs.readFileSync(path.join(root, 'scripts', 'test', 'macos-bootstrap.sh'), 'utf8');
  const releaseWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  const bootstrapWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'bootstrap-macos.yml'), 'utf8');
  const publicEntrypoints = [
    'install.ps1',
    'install.sh',
    'update.ps1',
    'update.sh',
    'uninstall.ps1',
    'uninstall.sh'
  ].sort();
  const rootFiles = fs.readdirSync(bootstrap, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(rootFiles, publicEntrypoints);

  const internal = path.join(bootstrap, 'internal');
  assert.deepEqual(fs.readdirSync(path.join(internal, 'windows')).sort(), [
    'protocol-handler.ps1',
    'register-updater.ps1',
    'unregister-updater.ps1'
  ]);
  assert.deepEqual(fs.readdirSync(path.join(internal, 'macos')).sort(), [
    'register-updater.sh',
    'unregister-updater.sh'
  ]);
  for (const file of ['start.ps1', 'stop.ps1', 'restart.ps1', 'check.ps1', 'common.ps1', 'launcher-action.sh']) {
    assert.equal(fs.existsSync(path.join(bootstrap, file)), false, file);
  }
  assert.match(installMac, /ONFRAME_RELEASE_ARCHIVE/);
  assert.match(installMac, /internal\/macos\/register-updater\.sh/);
  assert.match(updateMac, /ONFRAME_INSTALLER_PATH/);
  assert.doesNotMatch(macIntegration, /npm run package:release|node -p/);
  assert.match(macIntegration, /ditto -c -k --keepParent/);
  assert.match(macIntegration, /cp -R "\$ROOT\/scripts\/bootstrap"/);
  assert.match(macIntegration, /"\$executable" 'onframe-updater:\/\/update'/);
  assert.match(macIntegration, /ONFRAME_REMOVE_DATA=1 "\$uninstaller"/);
  assert.doesNotMatch(releaseWorkflow, /bootstrap\/common\.sh|onframe_write_agent|onframe_register_launcher/);
  assert.doesNotMatch(releaseWorkflow, /ONBLIDE_DESIGN_SYSTEM_DEPLOY_KEY|onblide-design-system/);
  assert.match(releaseWorkflow, /run: \/bin\/sh scripts\/test\/macos-bootstrap\.sh/);
  assert.doesNotMatch(bootstrapWorkflow, /ONBLIDE_DESIGN_SYSTEM_DEPLOY_KEY|onblide-design-system|setup-node|npm ci/);
  assert.match(bootstrapWorkflow, /macos-latest/);
  assert.match(bootstrapWorkflow, /macos-15-intel/);
  assert.match(bootstrapWorkflow, /branches:[\s\S]*- dev[\s\S]*- main/);
});
