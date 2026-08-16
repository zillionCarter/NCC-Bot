import { beforeAll } from 'vitest';
import { env, applyD1Migrations } from 'cloudflare:test';
import type { Env } from '../src/types';

// @ts-expect-error - virtual module
import migrations from 'virtual:d1-migrations';

const testEnv = env as unknown as Env;

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, migrations);
  // ALLOW_ANY_EMAIL_DOMAIN is a temporary testing-only var that may be set in
  // wrangler.toml for local/deployed testing — it must never leak into this
  // suite, which is what actually locks in the .edu.au signup restriction.
  (testEnv as unknown as { ALLOW_ANY_EMAIL_DOMAIN?: string }).ALLOW_ANY_EMAIL_DOMAIN = undefined;
});
