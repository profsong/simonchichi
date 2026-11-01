import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: 'pages.spec.ts',
  outputDir: 'test-results-pages',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report-pages' }],
    ['json', { outputFile: 'artifacts/pages/pages-e2e-results.json' }],
  ],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4176/simonchichi/' },
  webServer: {
    command: 'node scripts/serve-pages-test.mjs',
    url: 'http://127.0.0.1:4176/simonchichi/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
