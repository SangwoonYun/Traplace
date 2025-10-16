// File: eslint.config.js
import js from '@eslint/js';
import configPrettier from 'eslint-config-prettier';

export default [
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '**/*.min.js',
      'app/static/vendor/**',
      '.venv/**',
      'venv/**',
    ],
  },

  // ESLint recommended base
  js.configs.recommended,

  // Disable formatting-related rules (defer to Prettier)
  configPrettier,

  // Project rules for our JS files
  {
    files: ['app/static/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        history: 'readonly',
        location: 'readonly',
      },
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
