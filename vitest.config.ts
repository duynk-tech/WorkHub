import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      // server-only ném lỗi ngoài môi trường Next — thay bằng stub rỗng khi chạy test
      'server-only': resolve(import.meta.dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
