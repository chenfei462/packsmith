import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/packsmith/',
    locale: 'en-US',
    timezoneId: 'Asia/Shanghai',
    colorScheme: 'light',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    env: {
      SITE_BASE_PATH: '/packsmith/',
    },
    url: 'http://127.0.0.1:4173/packsmith/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      grepInvert: /@fallback|@reduced/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      grepInvert: /@fallback|@reduced/,
      use: {
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'reduced-motion',
      grep: /@reduced/,
      use: {
        viewport: { width: 1024, height: 768 },
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
    {
      name: 'no-webgl',
      grep: /@fallback/,
      use: {
        viewport: { width: 1024, height: 768 },
        launchOptions: {
          args: ['--disable-webgl', '--disable-webgl2'],
        },
      },
    },
  ],
})
