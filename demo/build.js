const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.onframe', 'demo');
fs.mkdirSync(output, { recursive: true });

esbuild
  .build({
    entryPoints: [path.join(__dirname, 'marketplace.jsx')],
    outfile: path.join(output, 'marketplace.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110'],
    jsx: 'automatic',
    minify: true,
    alias: {
      react: require.resolve('react'),
      'react/jsx-runtime': require.resolve('react/jsx-runtime'),
      'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime'),
      'react-dom': require.resolve('react-dom'),
      'react-dom/client': require.resolve('react-dom/client')
    },
    logLevel: 'info'
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
