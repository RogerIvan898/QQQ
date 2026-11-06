import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import perfectionist from 'eslint-plugin-perfectionist';

export default defineConfig([
  {
    ignores: [
      'dist',
      'public/mockServiceWorker.js',
      'src/locales/**/messages.ts',
      'scripts/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      perfectionist,
    },
    rules: {
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      'react-hooks/set-state-in-effect': 'off',

      'perfectionist/sort-imports': [
        'error',
        {
          type: 'natural',
          order: 'asc',
          internalPattern: [
            '^app(/.*)?$',
            '^pages(/.*)?$',
            '^widgets(/.*)?$',
            '^features(/.*)?$',
            '^entities(/.*)?$',
            '^shared(/.*)?$',
            '^@(/.*)?$',
          ],
          groups: [
            'react',
            'external',
            [
              'fsd-app',
              'fsd-pages',
              'fsd-widgets',
              'fsd-features',
              'fsd-entities',
              'fsd-shared',
            ],
            'parent',
            'sibling',
            'index',
            'side-effect-style',
          ],
          customGroups: [
            {
              groupName: 'react',
              elementNamePattern: ['^react$', '^react-dom$', '^react-.+'],
            },
            {
              groupName: 'fsd-app',
              elementNamePattern: ['^@/app(/.*)?$', '^app(/.*)?$'],
            },
            {
              groupName: 'fsd-pages',
              elementNamePattern: ['^@/pages(/.*)?$', '^pages(/.*)?$'],
            },
            {
              groupName: 'fsd-widgets',
              elementNamePattern: ['^@/widgets(/.*)?$', '^widgets(/.*)?$'],
            },
            {
              groupName: 'fsd-features',
              elementNamePattern: ['^@/features(/.*)?$', '^features(/.*)?$'],
            },
            {
              groupName: 'fsd-entities',
              elementNamePattern: ['^@/entities(/.*)?$', '^entities(/.*)?$'],
            },
            {
              groupName: 'fsd-shared',
              elementNamePattern: ['^@/shared(/.*)?$', '^shared(/.*)?$'],
            },
          ],
          newlinesBetween: 1,
          tsconfig: {
            rootDir: '.',
            filename: 'tsconfig.app.json',
          },
        },
      ],
    },
  },
]);
