import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-po';

export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'ru'],
  fallbackLocales: {
    default: 'en',
  },
  compileNamespace: 'ts',
  orderBy: 'message',
  format: formatter({
    lineNumbers: false,
    origins: false,
  }),
  catalogs: [
    {
      path: '<rootDir>/src/locales/{locale}/messages',
      include: ['src'],
      exclude: [
        '**/*.test.*',
        '**/*.stories.*',
        '**/locales/**',
        '**/toggle-dev-mode/**',
      ],
    },
  ],
});
