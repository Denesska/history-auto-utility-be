// Flat config (eslint.config.js) — replaces .eslintrc.js, which eslint 9+ no
// longer reads by default. Same rule set as before, just in the new format:
// @typescript-eslint's recommended rules, eslint-plugin-prettier/recommended,
// and this project's own overrides. Deliberately does NOT pull in
// `@eslint/js`'s core `eslint:recommended` set — the old .eslintrc.js never
// extended that either (only `plugin:@typescript-eslint/recommended` +
// `plugin:prettier/recommended`), and core rules like `no-undef` are known to
// false-positive on TS-only globals (e.g. the `Express` namespace from
// @types/express) once the TS-aware checking is already doing that job.
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierRecommended = require('eslint-plugin-prettier/recommended');
const globals = require('globals');

module.exports = [
  {
    ignores: ['eslint.config.js', 'dist/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // `ignoreRestSiblings` covers the `const { fieldToDrop, ...rest } = data`
      // pattern used throughout car.service.ts to exclude a field from an update
      // payload — the extracted binding is deliberately never read. The `^_`
      // patterns match this codebase's existing convention (e.g.
      // `_ignoredOrganizationId`) for a destructured binding kept only for
      // documentation/exclusion purposes.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  prettierRecommended,
];
