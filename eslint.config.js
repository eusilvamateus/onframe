const { defineConfig, globalIgnores } = require('eslint/config');
const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');
const eslintConfigPrettier = require('eslint-config-prettier');
const tseslint = require('typescript-eslint');

const sourceFiles = ['**/*.{js,jsx,ts,tsx}'];
const typescriptFiles = ['**/*.{ts,tsx}'];
const generatedFiles = [
  'cloudflare/public/**',
  'cloudflare/worker-configuration.d.ts',
  'dist/**',
  'extension/vendor/**',
  'extension/ui/options/app.js',
  'extension/ui/popup/app.js',
  'extension/core/{characteristics-view,commerce-actions-view,commerce-direct-discount-view,commerce-price-view,commerce-promotion-manager-view,commerce-promotions-view,description-view,period,photos-view,theme-init,toast}.js'
];

module.exports = defineConfig([
  globalIgnores(['**/node_modules/**', '.code-review-graph/**', '.onframe/**', ...generatedFiles]),
  {
    name: 'onframe/base',
    files: sourceFiles,
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    },
    rules: {
      ...js.configs.recommended.rules,
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-duplicate-imports': 'error',
      'no-useless-assignment': 'off',
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },
  {
    name: 'onframe/javascript',
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', varsIgnorePattern: '^_' }]
    }
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    name: `onframe/${config.name}`,
    files: typescriptFiles
  })),
  {
    name: 'onframe/typescript',
    files: typescriptFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none', varsIgnorePattern: '^_' }
      ]
    }
  },
  {
    name: 'onframe/browser-extension',
    files: ['extension/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        module: 'readonly'
      }
    }
  },
  {
    name: 'onframe/node',
    files: [
      'eslint.config.js',
      'prettier.config.js',
      'scripts/**/*.js',
      'test/**/*.{js,ts,tsx}',
      'cloudflare/test/**/*.ts',
      'cloudflare/src/domain/**/*.js'
    ],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    name: 'onframe/commonjs',
    files: [
      'eslint.config.js',
      'prettier.config.js',
      'scripts/**/*.js',
      'test/**/*.js',
      'cloudflare/src/domain/**/*.js'
    ],
    languageOptions: {
      sourceType: 'commonjs'
    }
  },
  {
    name: 'onframe/legacy-contracts',
    files: ['cloudflare/src/legacy-contracts.ts'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off'
    }
  },
  {
    name: 'onframe/shared-test-fixtures',
    files: ['test/commerce.test.js', 'test/items.test.js', 'test/photos.test.js'],
    rules: {
      'no-unused-vars': 'off'
    }
  },
  {
    name: 'onframe/react-hooks',
    files: ['extension/ui/**/*.{jsx,tsx}'],
    plugins: {
      'react-hooks': reactHooks
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  eslintConfigPrettier
]);
