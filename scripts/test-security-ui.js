const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.resolve(root, '.onframe', 'tests', 'security-ui.test.cjs');
if (!output.startsWith(root + path.sep)) throw new Error('Diretorio de testes invalido.');
// O pacote local do DS tem seu proprio React de desenvolvimento; o teste usa o mesmo alias do build.
esbuild.build({
  entryPoints: [path.join(root, 'test', 'security-ui.test.tsx')],
  outfile: output, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-test-renderer', '@supabase/supabase-js']
}).then(() => {
  const result = spawnSync(process.execPath, ['--test', output], { cwd: root, stdio: 'inherit' });
  fs.rmSync(output, { force: true });
  process.exitCode = result.status ?? 1;
}).catch(() => { process.exitCode = 1; });
