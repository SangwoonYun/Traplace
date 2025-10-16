// File: eslint.config.js
import js from '@eslint/js';
import configPrettier from 'eslint-config-prettier';
import globals from 'globals';

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

  // Base recommended rules
  js.configs.recommended,

  // Turn off formatting-related rules (use Prettier)
  configPrettier,

  // Project rules
  {
    files: ['app/static/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // ✅ Inject browser globals (covers window, document, fetch, URL, etc.)
      globals: {
        ...globals.browser,

        // Extra DOM/Timing globals that some browsers expose but eslint/globals
        // may not include consistently across versions:
        DOMMatrixReadOnly: 'readonly',
        DOMMatrix: 'readonly',
        DOMPoint: 'readonly',
        requestAnimationFrame: 'readonly',
        getComputedStyle: 'readonly',
        // (Most below are already in globals.browser, but kept for certainty)
        alert: 'readonly',
        confirm: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
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
