// Flat config (ESLint 9+/10 no longer reads .eslintrc.js). Same rule set as before:
// @typescript-eslint recommended + eslint-plugin-prettier recommended + this project's overrides.
// Deliberately NOT extending core `eslint:recommended` (the old config never did; `no-undef` false-positives on TS globals).
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierRecommended = require('eslint-plugin-prettier/recommended');
const globals = require('globals');

module.exports = [
  { ignores: ['eslint.config.js', 'jest-*.js', 'dist/**', 'coverage/**'] },
  ...tsPlugin.configs['flat/recommended'].map((c) => ({ ...c, files: ['**/*.ts'] })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: 'tsconfig.json', tsconfigRootDir: __dirname, sourceType: 'module' },
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // `ignoreRestSiblings` covers `const { fieldToDrop, ...rest } = data` (car.service.ts); `^_` is the codebase convention for intentionally unused bindings.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  prettierRecommended,
];
