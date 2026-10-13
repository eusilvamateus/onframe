const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const outdir = path.resolve(root, '.onframe', 'tests');
if (!outdir.startsWith(root + path.sep)) throw new Error('Diretorio de testes invalido.');
const outputs = ['security-ui.test.cjs', 'workspace-people-ui.test.cjs', 'popup-workspace-ui.test.cjs', 'popup-integrations-ui.test.cjs', 'history-ui.test.cjs'].map((file) => path.join(outdir, file));
// O pacote local do DS tem seu proprio React de desenvolvimento; o teste usa o mesmo alias do build.
esbuild.build({
  entryPoints: ['security-ui.test.tsx', 'workspace-people-ui.test.tsx', 'popup-workspace-ui.test.tsx', 'popup-integrations-ui.test.tsx', 'history-ui.test.tsx'].map((file) => path.join(root, 'test', file)),
  outdir, outExtension: { '.js': '.cjs' }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-test-renderer', '@supabase/supabase-js']
}).then(() => {
  const result = spawnSync(process.execPath, ['--test', ...outputs], { cwd: root, stdio: 'inherit' });
  for (const output of outputs) fs.rmSync(output, { force: true });
  process.exitCode = result.status ?? 1;
}).catch(() => { process.exitCode = 1; });
