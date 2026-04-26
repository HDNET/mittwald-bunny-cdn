import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,prop}.ts'],
    testTimeout: 10000,
    env: {
      ENCRYPTION_MASTER_PASSWORD: 'test-password',
      ENCRYPTION_SALT: 'test-salt',
    },
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './src'),
    },
  },
})
