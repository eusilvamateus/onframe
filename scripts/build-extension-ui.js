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

fs.copyFileSync(
  require.resolve('@onblide/ui/theme-init'),
  path.join(root, 'extension', 'core', 'theme-init.js')
);

const builds = entries.map((directory) => {
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
});

fs.rmSync(path.join(root, 'extension', 'core', 'period.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'shared', 'period-global.js')],
  outfile: path.join(root, 'extension', 'core', 'period.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110'],
  treeShaking: true,
  logLevel: 'info'
}));

fs.rmSync(path.join(root, 'extension', 'core', 'datepicker.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'content', 'datepicker-bridge.jsx')],
  outfile: path.join(root, 'extension', 'core', 'datepicker.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110'],
  jsx: 'automatic',
  minify: true,
  alias: reactAliases,
  loader: { '.svg': 'text' },
  logLevel: 'info',
  metafile: true
}).then(assertSingleReact));

fs.rmSync(path.join(root, 'extension', 'core', 'button.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'content', 'button-bridge.jsx')],
  outfile: path.join(root, 'extension', 'core', 'button.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110'],
  jsx: 'automatic',
  minify: true,
  alias: reactAliases,
  loader: { '.svg': 'text' },
  logLevel: 'info',
  metafile: true
}).then(assertSingleReact));

Promise.all(builds).catch(() => process.exit(1));

function assertSingleReact(result) {
  const conflicts = Object.keys(result.metafile.inputs)
    .map((input) => path.resolve(root, input))
    .filter((input) => /[\\/]node_modules[\\/]react(?:[\\/]|$)/u.test(input))
    .filter((input) => !input.startsWith(reactRoot + path.sep));
  if (conflicts.length) {
    throw new Error(`O bundle incluiu uma cópia secundária do React: ${conflicts[0]}`);
  }
}
