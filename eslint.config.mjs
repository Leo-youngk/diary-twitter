import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    'node_modules/**',
    '.next/**',
    '.open-next/**',
    '.open-next.previous-deploy/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'env.d.ts',
    'public/sw.js',
    '.gstack/**',
    '.claude/**',
    '.trae/**',
  ]),
  {
    // These effects intentionally hydrate browser-only state after SSR. The
    // rule is useful for pure data flows, but would reject this app's storage
    // and theme hydration boundaries.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
