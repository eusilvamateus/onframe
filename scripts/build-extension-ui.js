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
const designSystemStylesPath = require.resolve('@onblide/ui/styles.css');
const designSystemSourceRoot = path.dirname(designSystemStylesPath);
const phosphorSourceRoot = path.join(
  designSystemSourceRoot,
  '..',
  'node_modules',
  '@phosphor-icons',
  'web',
  'src'
);
const phosphorTargetRoot = path.join(root, 'extension', 'vendor', 'phosphor');
const compactPhosphorWeights = [
  { directory: 'regular', family: 'Phosphor', file: 'Phosphor.woff2' },
  { directory: 'bold', family: 'Phosphor-Bold', file: 'Phosphor-Bold.woff2' },
  { directory: 'fill', family: 'Phosphor-Fill', file: 'Phosphor-Fill.woff2' }
];

prepareCompactPhosphorAssets();

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
    minify: true,
    alias: reactAliases,
    plugins: [compactDesignSystemStylesPlugin()],
    external: ['/fonts/*', '/vendor/phosphor/*'],
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

fs.rmSync(path.join(root, 'extension', 'core', 'toast.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'content', 'toast-bridge.jsx')],
  outfile: path.join(root, 'extension', 'core', 'toast.js'),
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

fs.rmSync(path.join(root, 'extension', 'core', 'photos-view.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'content', 'photos-view.jsx')],
  outfile: path.join(root, 'extension', 'core', 'photos-view.js'),
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

fs.rmSync(path.join(root, 'extension', 'core', 'description-view.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'content', 'description-view.jsx')],
  outfile: path.join(root, 'extension', 'core', 'description-view.js'),
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

fs.rmSync(path.join(root, 'extension', 'core', 'characteristics-view.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'content', 'characteristics-view.jsx')],
  outfile: path.join(root, 'extension', 'core', 'characteristics-view.js'),
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

fs.rmSync(path.join(root, 'extension', 'core', 'commerce-price-view.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'content', 'commerce-price-view.jsx')],
  outfile: path.join(root, 'extension', 'core', 'commerce-price-view.js'),
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

fs.rmSync(path.join(root, 'extension', 'core', 'commerce-actions-view.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'content', 'commerce-actions-view.jsx')],
  outfile: path.join(root, 'extension', 'core', 'commerce-actions-view.js'),
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

fs.rmSync(path.join(root, 'extension', 'core', 'commerce-promotions-view.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'content', 'commerce-promotions-view.jsx')],
  outfile: path.join(root, 'extension', 'core', 'commerce-promotions-view.js'),
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

fs.rmSync(path.join(root, 'extension', 'core', 'commerce-promotion-manager-view.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'content', 'commerce-promotion-manager-view.jsx')],
  outfile: path.join(root, 'extension', 'core', 'commerce-promotion-manager-view.js'),
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

fs.rmSync(path.join(root, 'extension', 'core', 'commerce-direct-discount-view.js'), { force: true });
builds.push(esbuild.build({
  entryPoints: [path.join(root, 'extension', 'ui', 'content', 'commerce-direct-discount-view.jsx')],
  outfile: path.join(root, 'extension', 'core', 'commerce-direct-discount-view.js'),
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

runBuilds();

async function runBuilds() {
  try {
    await Promise.all(builds);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

function assertSingleReact(result) {
  const conflicts = Object.keys(result.metafile.inputs)
    .map((input) => path.resolve(root, input))
    .filter((input) => /[\\/]node_modules[\\/]react(?:[\\/]|$)/u.test(input))
    .filter((input) => !input.startsWith(reactRoot + path.sep));
  if (conflicts.length) {
    throw new Error(`O bundle incluiu uma cópia secundária do React: ${conflicts[0]}`);
  }
}

function compactDesignSystemStylesPlugin() {
  return {
    name: 'onframe-compact-design-system-styles',
    setup(build) {
      build.onLoad({ filter: /styles\.css$/ }, (args) => {
        if (path.resolve(args.path) !== path.resolve(designSystemStylesPath)) return null;
        const tokens = stripFontFaces(
          fs.readFileSync(path.join(designSystemSourceRoot, 'tokens.css'), 'utf8')
        );
        const phosphor = fs.readFileSync(path.join(phosphorTargetRoot, 'phosphor.css'), 'utf8');
        return {
          contents: `${compactFontFaces()}\n${phosphor}\n${tokens}`,
          loader: 'css',
          resolveDir: root
        };
      });
    }
  };
}

function prepareCompactPhosphorAssets() {
  fs.mkdirSync(phosphorTargetRoot, { recursive: true });
  const styles = compactPhosphorWeights.map(({ directory, family, file }) => {
    const sourceRoot = path.join(phosphorSourceRoot, directory);
    fs.copyFileSync(path.join(sourceRoot, file), path.join(phosphorTargetRoot, file));
    return `@font-face {
  font-family: '${family}';
  src: url('/vendor/phosphor/${file}') format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}\n${stripFontFaces(fs.readFileSync(path.join(sourceRoot, 'style.css'), 'utf8'))}`;
  });
  fs.writeFileSync(path.join(phosphorTargetRoot, 'phosphor.css'), `${styles.join('\n')}\n`);
}

function compactFontFaces() {
  const faces = [
    ['Poppins', 'Poppins-Regular.ttf', 400, 'normal'],
    ['Poppins', 'Poppins-Medium.ttf', 500, 'normal'],
    ['Poppins', 'Poppins-SemiBold.ttf', 600, 'normal'],
    ['Poppins', 'Poppins-Bold.ttf', 700, 'normal'],
    ['Poppins', 'Poppins-ExtraBold.ttf', 800, 'normal'],
    ['JetBrains Mono', 'JetBrainsMono-Medium.ttf', 500, 'normal'],
    ['Playfair Display', 'PlayfairDisplay-MediumItalic.ttf', 500, 'italic']
  ];
  return faces.map(([family, file, weight, fontStyle]) => `@font-face {
  font-family: '${family}';
  src: url('/fonts/${file}') format('truetype');
  font-weight: ${weight};
  font-style: ${fontStyle};
  font-display: swap;
}`).join('\n');
}

function stripFontFaces(source) {
  let output = '';
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('@font-face', cursor);
    if (start === -1) {
      output += source.slice(cursor);
      break;
    }
    output += source.slice(cursor, start);
    const openingBrace = source.indexOf('{', start);
    if (openingBrace === -1) throw new Error('Bloco @font-face inválido no design system.');
    let depth = 1;
    let index = openingBrace + 1;
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      index += 1;
    }
    if (depth !== 0) throw new Error('Bloco @font-face não finalizado no design system.');
    cursor = index;
  }
  return output.trim();
}
