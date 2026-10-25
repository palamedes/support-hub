import { defineConfig, devices } from '@playwright/test';

// Browser tests run against a build of tests/fixtures/config.yml in dist-test/
// (npm run test:e2e builds it first).
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'node scripts/serve.mjs --port 4173 --dir dist-test',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
  },
});
