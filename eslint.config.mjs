import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    'dist/**',
    '.wrangler/**',
    '.gstack/**',
    '.claude/**',
    '.trae/**',
    '.next/**',
    '.open-next/**',
    '.open-next.previous-deploy/**',
    '.tmp-cp-test/**',
    'icon-preview.html',
  ]),
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Node CommonJS preload for the build (see scripts/deploy.mjs).
    files: ['scripts/**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
