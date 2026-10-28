import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: { testTimeout: 60000, hookTimeout: 120000, pool: 'forks', include: ['tests/**/*.test.{ts,tsx}'] },
});
