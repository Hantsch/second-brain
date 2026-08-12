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
);
