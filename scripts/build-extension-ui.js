const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const reactRoot = path.dirname(require.resolve('react'));
const reactAliases = {
  react: require.resolve('react'),
  'react/jsx-runtime': require.resolve('react/jsx-runtime'),
  'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime'),
  'react-dom': require.resolve('react-dom'),
  'react-dom/client': require.resolve('react-dom/client')
};
const entries = [
  path.join(root, 'extension', 'ui', 'options'),
  path.join(root, 'extension', 'ui', 'popup')
];

Promise.all(entries.map((directory) => {
  fs.rmSync(path.join(directory, 'assets'), { recursive: true, force: true });
  fs.rmSync(path.join(directory, 'app.js'), { force: true });
  fs.rmSync(path.join(directory, 'app.css'), { force: true });
  return esbuild.build({
    entryPoints: [path.join(directory, 'app.jsx')],
    outdir: directory,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110'],
    jsx: 'automatic',
    alias: reactAliases,
    assetNames: 'assets/[name]-[hash]',
    loader: {
      '.ttf': 'file',
      '.woff': 'file',
      '.woff2': 'file',
      '.svg': 'file'
    },
    logLevel: 'info',
    metafile: true
  }).then(assertSingleReact);
})).catch(() => process.exit(1));

function assertSingleReact(result) {
  const conflicts = Object.keys(result.metafile.inputs)
    .map((input) => path.resolve(root, input))
    .filter((input) => /[\\/]node_modules[\\/]react(?:[\\/]|$)/u.test(input))
    .filter((input) => !input.startsWith(reactRoot + path.sep));
  if (conflicts.length) {
    throw new Error(`O bundle incluiu uma cópia secundária do React: ${conflicts[0]}`);
  }
}
