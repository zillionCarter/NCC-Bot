import { beforeAll } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import type { Env } from '../src/types';

// @ts-expect-error - virtual module
import migrations from 'virtual:d1-migrations';

const testEnv = env as unknown as Env;

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, migrations);
});
