import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            '*.config.js',
            'src/__tests__/*.test.ts',
            'src/__tests__/fixtures/*.ts',
          ],
          defaultProject: 'tsconfig.test.json',
          // 20 → 32 at 0.20.2: the cap counts src/__tests__/*.test.ts (21 files now) plus
          // fixtures; at 20 the 21st file made two UNRELATED test files fail to parse
          // ("Too many files (>20) have matched the default project"), which reads as
          // a lint error in files nobody touched. Raise it deliberately when adding tests.
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 32,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
    },
  },
  {
    // Relaxed rules for tool handlers
    // Tools are the any-boundary between MCP's dynamic snake_case input
    // and the typed SDK. Zod validates structure, normalizeKeys transforms
    // keys — TypeScript cannot track the key transformation statically.
    files: ['src/tools/**/*.ts', 'src/utils/tool-handler.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // Relaxed rules for test files
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.js'],
  }
);
