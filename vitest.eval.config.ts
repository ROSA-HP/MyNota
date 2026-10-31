import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Prompt test set (tests/prompt-set): real AI calls with your own key; never part of `npm test`.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/prompt-set/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30 * 60 * 1000,
  },
})
