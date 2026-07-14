// Scrutari ESLint configuration (flat config format for ESLint v10)
import globals from 'globals';
import scrutariPlugin from './eslint/scrutari-plugin.js';

export default [
  {
    ignores: ['node_modules/**', '**/*.html'],
  },
  // Scrutari custom rules plugin — appliesto all JS files
  {
    plugins: {
      scrutari: scrutariPlugin,
    },
    rules: {
      'scrutari/no-empty-catch': 'warn',
      'scrutari/require-strict-mode': 'warn',
      'scrutari/no-floating-promises': 'warn',
    },
  },
  // CommonJS files (standalone server)
  {
    files: ['submit-endpoint/server.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.node, ...globals.es2025 } },
    rules: {
      'scrutari/require-strict-mode': 'error',
      'scrutari/no-raw-ip-access': 'warn',
      'scrutari/require-normalize-ip-def': 'error',
      'scrutari/require-rate-limit-first': 'warn',
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  // Node.js server-side code (ESM modules)
  {
    files: ['lib/**/*.js', 'lib/**/*.mjs', 'test/**/*.mjs', 'test/**/*.js',
            'submit-endpoint/**/*.mjs', 'submit-endpoint/**/*.js',
            'automation/**/*.mjs', 'automation/**/*.js',
            'netlify/edge-functions/*.js'],
    languageOptions: { ecmaVersion: 2025, sourceType: 'module',
      globals: { ...globals.node, ...globals.es2025 } },
    rules: {
      // ── Scrutari custom rules ──
      'scrutari/no-raw-ip-access': 'warn',
      'scrutari/require-normalize-ip-def': 'error',
      'scrutari/require-archive-cleanup': 'warn',
      'scrutari/require-distribution-cap': 'error',
      'scrutari/require-rate-limit-first': 'warn',

      // ── Core correctness (already enabled) ──
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-constant-binary-expression': 'error',
      'no-promise-executor-return': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'no-unmodified-loop-condition': 'warn',
      'require-atomic-updates': 'warn',
      'no-async-promise-executor': 'error',
      'no-await-in-loop': 'warn',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': 'error',
      'no-constant-condition': 'warn',
      'no-debugger': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-ex-assign': 'error',
      'no-fallthrough': 'warn',
      'no-inner-declarations': 'warn',
      'no-irregular-whitespace': 'error',
      'no-loss-of-precision': 'error',
      'no-setter-return': 'error',
      'no-sparse-arrays': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-useless-catch': 'warn',
      'valid-typeof': 'error',

      // ── Additional high-value rules (new this session) ──
      'default-case': ['warn', { commentPattern: 'skip|fall through' }],
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-implicit-globals': 'warn',
      'no-implied-eval': 'error',
      'no-loop-func': 'warn',
      'no-new-wrappers': 'error',
      'no-param-reassign': ['warn', { props: false }],
      'no-redeclare': 'error',
      'no-return-assign': 'warn',
      'no-sequences': 'warn',
      'no-throw-literal': 'error',
      'no-useless-concat': 'warn',
      'prefer-const': 'warn',
      'prefer-regex-literals': 'warn',
      'radix': 'error',
    },
  },
  // Honeypot-specific rules
  {
    files: ['netlify/edge-functions/honeypot.js'],
    rules: {
      'scrutari/no-direct-console-in-honeypot': 'warn',
    },
  },
  // Browser/client-side code
  {
    files: ['lib/**/*.js'],
    rules: { 'no-console': 'off' },
  },
];
