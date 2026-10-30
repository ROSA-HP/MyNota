import { defineConfig } from 'vitest/config'

// RLS tests run against a real Postgres (see tests/rls/README.md).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
})
