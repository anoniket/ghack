import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['src/__tests__/**/*.test.ts'],
    globals: true,
    environment: 'node',
    // Each test file gets its own isolated worker so vi.mock() doesn't leak
    pool: 'forks',
    testTimeout: 15000,
    hookTimeout: 10000,
  },
});
