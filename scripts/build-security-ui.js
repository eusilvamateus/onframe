const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'cloudflare', 'public', 'security');
if (!output.startsWith(root + path.sep)) throw new Error('Diretorio de build invalido.');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(root, 'extension', 'ui', 'passkeys', 'index.html'), path.join(output, 'index.html'));
fs.copyFileSync(path.join(root, 'extension', 'core', 'remote-auth.js'), path.join(output, 'remote-auth.js'));
fs.copyFileSync(path.join(root, 'extension', 'assets', 'onframe-stacked-primary.png'), path.join(output, 'onframe-stacked-primary.png'));
esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'passkeys', 'app.jsx')],
  outdir: output, bundle: true, format: 'iife', platform: 'browser',
  target: ['chrome110'], jsx: 'automatic', minify: true,
  alias: { react: require.resolve('react'), 'react/jsx-runtime': require.resolve('react/jsx-runtime'), 'react-dom': require.resolve('react-dom'), 'react-dom/client': require.resolve('react-dom/client') },
  assetNames: 'assets/[name]-[hash]',
  loader: { '.ttf': 'file', '.woff': 'file', '.woff2': 'file', '.svg': 'file' },
  logLevel: 'info'
}).catch(() => process.exit(1));
