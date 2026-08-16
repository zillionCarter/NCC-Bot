import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'frontend',
    environment: 'jsdom',
    include: ['src/frontend/**/*.test.{ts,tsx}'],
    setupFiles: ['src/frontend/test-setup.ts'],
  },
});
