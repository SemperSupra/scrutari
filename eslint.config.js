// Scrutari ESLint configuration (flat config format for ESLint v10)
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/**', '**/*.html'],
  },
  // Node.js server-side code
  {
    files: ['lib/**/*.js', 'lib/**/*.mjs', 'test/**/*.mjs', 'test/**/*.js',
            'submit-endpoint/**/*.mjs', 'submit-endpoint/**/*.js',
            'automation/**/*.mjs', 'automation/**/*.js',
            'netlify/edge-functions/*.js'],
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2025,
      },
    },
    rules: {
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
    },
  },
  // Browser/client-side code (extracted logic only)
  {
    files: ['lib/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
];
