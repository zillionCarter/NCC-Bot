import { Hono } from 'hono';
import type { Env, User } from './types';
import { authRoutes } from './auth/routes';

export type AppEnv = { Bindings: Env; Variables: { user: User } };

const app = new Hono<AppEnv>();

app.get('/health', (c) => c.json({ ok: true }));
app.route('/auth', authRoutes);

export default app;
