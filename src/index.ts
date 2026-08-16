import { Hono } from 'hono';
import type { Env, User } from './types';
import { authRoutes } from './auth/routes';
import { chatRoutes } from './chat/routes';
import { adminRoutes } from './admin/routes';
import { onboardingRoutes } from './onboarding/routes';
import { meRoutes } from './me/routes';
import { conversationsRoutes } from './chat/conversationsRoutes';

export type AppEnv = { Bindings: Env; Variables: { user: User } };

const app = new Hono<AppEnv>();

app.get('/health', (c) => c.json({ ok: true }));
app.route('/auth', authRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/onboarding', onboardingRoutes);
app.route('/api/me', meRoutes);
app.route('/api/conversations', conversationsRoutes);

export default app;
