# Deploy Checklist

This backend has no automated deploy pipeline. These steps require your own
Cloudflare and Resend accounts, so they can't be scripted — do them once, in
order, before the first real deploy.

1. **Create the D1 database**

   ```bash
   npx wrangler d1 create ncc-bot-db
   ```

   Paste the printed `database_id` into `wrangler.toml` under `[[d1_databases]]`
   (it starts as the placeholder `REPLACE_AFTER_RUNNING_WRANGLER_D1_CREATE`).

2. **Set `SITE_URL` in `wrangler.toml`**

   `wrangler.toml`'s `[vars]` block ships with `SITE_URL = "REPLACE_WITH_YOUR_DEPLOYED_WORKER_URL"`.
   Magic-link sign-in emails are built directly from this value — if it's left
   as the placeholder (or a local dev URL), production sign-in links will point
   at the wrong host and nobody will be able to sign in. Set it to your real
   deployed Worker URL (e.g. `https://ncc-bot.<your-subdomain>.workers.dev`, or
   your custom domain) before deploying.

3. **Set the required secrets**

   ```bash
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put ADMIN_EMAIL
   ```

   `ADMIN_EMAIL` must be a `.edu.au` address — the account matching it (compared
   case-insensitively) is auto-promoted to `admin` the first time it logs in.

4. **Verify a sending domain in Resend**

   Add and verify a sending domain in your Resend dashboard, then update
   `EMAIL_FROM` in `wrangler.toml` to use an address on that domain — Resend
   rejects sends from an unverified domain.

5. **Apply migrations to the remote database**

   ```bash
   npm run db:migrate:remote
   ```

6. **Deploy**

   ```bash
   npm run deploy
   ```

7. **Sanity check**: request a magic link for the `ADMIN_EMAIL` address, follow
   the link, and confirm the account comes up with role `admin`
   (`GET /api/admin/users` should list it once you're logged in as admin — see
   `src/admin/routes.ts`).
