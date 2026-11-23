const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('o pacote da loja contém somente a extensão com manifesto na raiz', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'release', 'package-store.js'), 'utf8');
  const scripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  assert.match(source, /fs\.cpSync\(extensionDir, stagingDir/);
  assert.match(source, /'manifest\.json'/);
  assert.match(source, /delete manifest\.key/);
  assert.match(source, /'ui\/options\/app\.js'/);
  assert.match(scripts['package:store'], /package-store\.js/);
  assert.equal(scripts['package:release'], undefined);
  assert.doesNotMatch(source, /bootstrap|package\.json'\]/);
});

test('domínio comercial pertence ao Worker e é compatível com a suíte Node', () => {
  const contracts = fs.readFileSync(path.join(root, 'cloudflare', 'src', 'legacy-contracts.ts'), 'utf8');
  const moduleType = JSON.parse(
    fs.readFileSync(path.join(root, 'cloudflare', 'src', 'domain', 'package.json'), 'utf8')
  );
  assert.equal(moduleType.type, 'commonjs');
  assert.match(contracts, /\.\/domain\/account-client\.js/);
  assert.match(contracts, /\.\/domain\/routes\/promotions\.js/);
  assert.equal(fs.existsSync(path.join(root, 'service')), false);
});

test('promoções pendentes usam Workflow durável e reconciliação consultável', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'cloudflare', 'wrangler.jsonc'), 'utf8'));
  const worker = fs.readFileSync(path.join(root, 'cloudflare', 'src', 'remote-api.ts'), 'utf8');
  const workflow = fs.readFileSync(
    path.join(root, 'cloudflare', 'src', 'promotion-reconciliation-workflow.ts'),
    'utf8'
  );
  const extension = fs.readFileSync(path.join(root, 'extension', 'modules', 'commerce', 'module.js'), 'utf8');
  const migration = fs.readFileSync(
    path.join(root, 'cloudflare', 'migrations', '0011_promotion_reconciliations.sql'),
    'utf8'
  );

  assert.deepEqual(
    config.workflows.find((entry) => entry.binding === 'PROMOTION_RECONCILIATION'),
    {
      name: 'onframe-promotion-reconciliation',
      binding: 'PROMOTION_RECONCILIATION',
      class_name: 'PromotionReconciliationWorkflow'
    }
  );
  assert.equal(config.main, 'src/worker.ts');
  assert.match(workflow, /class PromotionReconciliationWorkflow extends WorkflowEntrypoint/);
  assert.match(worker, /GET \/bulk\/reconciliations/);
  assert.match(worker, /PROMOTION_RECONCILIATION\.create/);
  assert.match(worker, /runPromotionOfferMutation/);
  assert.match(worker, /acceptedPromotionMutation/);
  assert.match(worker, /status: 'pending_confirmation'/);
  assert.match(worker, /registerPendingPromotionReconciliation/);
  assert.match(extension, /\/api\/bulk\/reconciliations\?ids=/);
  assert.match(extension, /function applyOptimisticPromotionMutation/);
  assert.match(extension, /function reconcilePromotionManagerMutation/);
  assert.match(migration, /CREATE TABLE promotion_reconciliations/);
  assert.match(migration, /idx_item_edit_events_idempotent/);
});

test('não existe instalador ou atualizador local no projeto e na release', () => {
  const releaseWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'release.yml'), 'utf8');
  const bootstrap = path.join(root, 'scripts', 'bootstrap');
  const bootstrapFiles = fs.existsSync(bootstrap)
    ? fs.readdirSync(bootstrap, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    : [];
  assert.equal(bootstrapFiles.length, 0);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'test', 'macos-bootstrap.sh')), false);
  assert.equal(fs.existsSync(path.join(root, '.github', 'workflows', 'bootstrap-macos.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts', 'release', 'package-release.js')), false);
  assert.match(releaseWorkflow, /dist\/onframe-store-/);
  assert.doesNotMatch(releaseWorkflow, /bootstrap|onframe-updater|dist\/onframe-\$\(\$env:GITHUB_REF_NAME\)\.zip/);
  assert.doesNotMatch(releaseWorkflow, /ONBLIDE_DESIGN_SYSTEM_DEPLOY_KEY|onblide-design-system/);
});
