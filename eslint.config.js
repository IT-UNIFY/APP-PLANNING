import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', '.claude/worktrees/**', 'supabase/.temp/**',
      // Code GÉNÉRÉ par scripts/vendorer-socle.mjs : le corriger ici serait
      // écrasé, et `npm run verify` refuse toute édition locale.
      'supabase/functions/_shared/socle/**'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'unused-imports': unusedImports,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Interdit `console.*` côté frontend : passer par `src/lib/logger.ts`.
      // Le wrapper lui-même est exempté par l'override plus bas.
      'no-console': 'error',

      // Zéro tolérance pour `any`. Un `any` introduit se remplace par un type
      // explicite, ou par `unknown` avec un narrowing.
      '@typescript-eslint/no-explicit-any': 'error',

      // Remplace `@typescript-eslint/no-unused-vars` par la version
      // auto-corrigeable. Les imports inutilisés deviennent `error` (retirés
      // au `--fix`) ; les variables inutilisées restent en `warn`, pour éviter
      // les faux positifs sur les paramètres de callback positionnels.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Le wrapper logger est le SEUL endroit autorisé à appeler `console.*`.
    files: ['src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Edge Functions (Deno) et scripts Node : leurs logs vont dans Supabase ou
    // sur stdout, pas dans le navigateur.
    files: ['supabase/functions/**/*.ts', 'scripts/**/*.{mjs,ts}'],
    rules: { 'no-console': 'off' },
  },
);
