import { defineConfig } from 'vitest/config'

export default defineConfig(
  import('vite-tsconfig-paths').then(({ default: tsconfigPaths }) => ({
    plugins: [tsconfigPaths()],
    esbuild: {
      jsx: 'automatic' as const,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./test/setup.ts'],
      include: ['test/**/*.test.{ts,tsx}'],
      clearMocks: true,
    },
  })),
)
