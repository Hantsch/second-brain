import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'release/**', '.demo-vault/**', '.screenshots/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    /* Der Kern ist reines TypeScript und darf Electron nie kennen — das haelt ihn
       testbar und den Renderer frei von Dateisystemzugriff. */
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['electron'], patterns: ['electron/*'] }],
    },
  },
  {
    /* Skripte und Tests laufen unter Node, dürfen loggen — und die Rümpfe von
       `page.evaluate(...)` in den Playwright-Skripten laufen im Renderer,
       brauchen also zusätzlich die Browser-Globals. */
    files: ['scripts/**/*.{js,mjs,cjs}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { 'no-console': 'off' },
  },
  {
    /* A gate test never times the code: the GitHub runner is ~5x slower than the
       dev machine, so `Date.now() - start` against a number fails a release for the
       runner's speed. Prove cost deterministically (bytes, calls — see
       tests/core/index/counting-store.ts) or put the budget in a `*.perf.test.ts`
       file, whose lane only warns (tests/helpers/perf.ts). */
    files: ['tests/**/*.{ts,tsx}'],
    ignores: ['tests/**/*.perf.test.ts', 'tests/helpers/perf.ts', 'tests/e2e/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "BinaryExpression[operator='-'][right.type='Identifier'][left.type='CallExpression'][left.callee.object.name=/^(Date|performance)$/][left.callee.property.name='now']",
          message:
            'Elapsed wall-clock time in a gate test. Assert a deterministic cost instead, or move the budget into a *.perf.test.ts file (perf lane, warns only).',
        },
      ],
    },
  },
);
