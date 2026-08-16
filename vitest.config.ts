import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  test: {
    pool: 'cloudflare',
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.worktrees/**'],
    projects: ['./vitest.config.ts', './vitest.frontend.config.ts'],
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
    }),
    {
      name: 'vite-plugin-d1-migrations',
      async resolveId(id) {
        if (id === 'virtual:d1-migrations') {
          return id;
        }
      },
      async load(id) {
        if (id === 'virtual:d1-migrations') {
          const migrationsPath = path.resolve(process.cwd(), 'migrations');
          const migrations = await readD1Migrations(migrationsPath);
          return `export default ${JSON.stringify(migrations)};`;
        }
      },
    },
  ],
});
