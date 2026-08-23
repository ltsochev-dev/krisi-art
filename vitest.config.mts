import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    /**
     * More than one spec file boots Payload, and the SQLite adapter pushes the
     * dev schema on connect. Two of those racing on the same database file fails
     * with "index ... already exists", so the files run one at a time.
     */
    fileParallelism: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
  },
})
