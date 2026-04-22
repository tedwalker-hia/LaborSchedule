import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'prisma/migrations/**',
      'public/**',
      'next-env.d.ts',
      'tests/spikes/**',
      'scripts/check-excel-verdict.ts',
      'e2e/**',
      'playwright.config.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      ...Object.fromEntries(
        Object.keys(reactHooks.configs.recommended.rules).map((r) => [r, 'warn']),
      ),
      // Phase 0 strict rules — warn for now; errors surface gradually as phases touch code.
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      // Existing noise to warn rather than error.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
