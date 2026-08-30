# Vitality — agent setup prompt

The one-prompt version (works from any empty folder — no clone needed first):

```
Clone https://github.com/ohwisey/vitality-oss and follow its SETUP-PROMPT.md exactly —
set everything up, run it, and help me sign up.
```

Or paste everything below this line into Claude Code, Codex, or any coding agent with a terminal (or, from the repo root, just say *"read SETUP-PROMPT.md and set this up for me"*).

---

You are setting up **Vitality**, an open-source multi-user life dashboard (Next.js 14 + Supabase, repo: https://github.com/ohwisey/vitality-oss). Your job is to take it from nothing to a running app — locally, and optionally deployed to Vercel — doing everything yourself except the few things that need my accounts. Work through the phases in order. Verify each phase before moving on. Never print, log, or commit secret values; they belong only in `.env.local` (gitignored) and in Vercel's env store.

Start by asking me one question: **"Local only, or local + deploy to Vercel?"** Then proceed.

## Phase 0 — Preflight

Check and fix the toolchain:

- `node -v` must be ≥ 20. If missing, install via the platform's standard route (nvm, brew, or nodejs.org).
- pnpm: the repo pins `pnpm@10.34.4` in `package.json` (`packageManager` field). On Node 20–24, `corepack enable` is the cleanest way to get it; Node 25+ no longer bundles corepack, so there just `npm i -g pnpm` (modern pnpm auto-switches to the pinned version inside the repo).
- `git`, and the **Supabase CLI** (`brew install supabase/tap/supabase`, or scoop/apt per platform).
- Only if deploying: **Vercel CLI** (`npm i -g vercel`).

If the repo isn't cloned yet: `git clone https://github.com/ohwisey/vitality-oss.git && cd vitality-oss`.

Run `pnpm install`. **Expected noise:** pnpm prints `Ignored build scripts: @sentry/cli, unrs-resolver` — this is pnpm 10's build-script blocking and it is harmless; the production build succeeds with those ignored. Do not run `pnpm approve-builds`; it only matters if Sentry source-map upload is configured later.

## Phase 1 — Supabase project

Ask me to do the one thing you can't: create (or pick) a Supabase project.

1. Tell me: "Create a free project at https://supabase.com/dashboard (any name, any region), then give me the **project ref** (the short id in the project's URL) and the **database password** you chose."
2. Then run, from the repo root (no `supabase init` needed — the repo ships migrations only, and `link`/`db push` work without a config.toml):
   ```bash
   supabase login       # opens a browser; I'll complete it
   supabase link --project-ref <ref>       # will prompt for the db password
   supabase db push     # applies all 77 migrations in supabase/migrations/ (schema, RLS, signup trigger)
   ```
3. Confirm the CLI printed `Finished supabase db push` with no errors. The first migration (`20260512000000_profiles_bootstrap.sql`) creates `public.profiles` and an `after insert on auth.users` trigger — signups don't work without it, so if the push failed partway, fix and re-push before continuing.
4. Fetch the keys: `supabase projects api-keys --project-ref <ref>` gives the **anon** and **service_role** keys; the URL is `https://<ref>.supabase.co`.

## Phase 2 — Environment

```bash
cp .env.example .env.local
```

Fill in (edit the file yourself; don't echo the values):

- `NEXT_PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon key
- `SUPABASE_SERVICE_ROLE_KEY` = service_role key
- `NEXT_PUBLIC_APP_URL` = `http://localhost:3000`

Everything else is optional and the app degrades gracefully. Ask me once, as a single checklist, which extras I want now — and skip whatever I don't answer:

- **Claude features** (AI mentor, food-photo scanning, tile Forge): `ANTHROPIC_API_KEY` from https://console.anthropic.com
- **Nutrition search**: free instant key from https://fdc.nal.usda.gov/api-key-signup.html → `USDA_API_KEY`
- **Stocks**: free key from https://finnhub.io/register → `FINNHUB_API_KEY`
- **Creator stats**: YouTube Data API v3 key → `YOUTUBE_API_KEY`
- Wearables (Oura/Fitbit OAuth apps) and Stripe are better done after deploy — offer them at the end.

## Phase 3 — Boot and smoke test

1. `pnpm dev`, then poll `http://localhost:3000` until it returns 200.
2. **Email-confirmation gotcha (do this BEFORE signup):** the signup flow assumes Supabase's "Confirm email" is OFF — the code calls `signUp` and goes straight to onboarding, and the confirmation email's link doesn't route anywhere useful. Tell me to switch it off at Supabase dashboard → Authentication → Sign In / Up → Email → "Confirm email". Alternatively, skip signup entirely: `node scripts/create-test-user.mjs` creates a fully-onboarded `stripe-test@vitality.test` / `test1234` via the service-role key (it reads `.env.local` itself).
3. Open `http://localhost:3000/signup` and tell me to create an account — or use the test login above.
4. Once signed in, hit `/api/systems/health` (auth-gated) — it reports which subsystems have their env keys present without leaking values. Report the table to me.
5. The dashboard at `/app` should render with starter tiles. That's a successful local setup — tell me so, and list what was skipped.

If I chose local-only: stop here, and offer the Vercel phase for later.

## Phase 4 — Vercel deploy (only if I said yes)

Order matters here; follow it exactly.

1. `vercel login` (I'll complete the browser step), then `vercel link` to create the project. Vercel honors the `packageManager` field, so the build uses pnpm automatically; `vercel.json` already defines the two daily cron jobs.
2. **Set env vars BEFORE the first real deploy** — the build goes green with zero env (verified), but at runtime the middleware calls Supabase on nearly every request, so a deploy without env 500s on every page. Add to Production (`vercel env add NAME production` for each, or via dashboard):
   - the three Supabase values from Phase 2
   - `CRON_SECRET` = a long random string you generate (`openssl rand -hex 32`). **Without it the two daily crons 401 silently forever** — Vercel automatically sends it as `Authorization: Bearer <CRON_SECRET>` once the env var exists.
   - any optional keys from Phase 2
3. `vercel deploy --prod`. Note the resulting URL (call it `https://<domain>`).
4. Now fix the URL-dependent env — `NEXT_PUBLIC_*` values are inlined at build time, so this **requires a redeploy**:
   - `NEXT_PUBLIC_APP_URL` = `https://<domain>` (OAuth redirects and Stripe return URLs break without it)
   - `NEXT_PUBLIC_SITE_URL` = `https://<domain>` (robots/sitemap)
   - `vercel deploy --prod` again.
5. Supabase auth must learn the domain — tell me to set, in Supabase dashboard → Authentication → URL Configuration:
   - Site URL: `https://<domain>`
   - Additional Redirect URLs: `https://<domain>/auth/callback` and `https://<domain>/reset-password`
   - (The "Continue with Google" button also needs the Google provider enabled there; otherwise it errors — fine to skip.)
6. Verify: open `https://<domain>`, sign up, check `/api/systems/health`, and test one cron manually:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/sync-wearables` → expect 200.

## Phase 5 — Optional extras (offer, don't push)

- **Stripe (paid tiers):** put test-mode `STRIPE_SECRET_KEY` in `.env.local` first — the bootstrap scripts read the *file*, not the shell env. Run `node scripts/stripe-bootstrap.mjs` (idempotently creates the $15/mo product; grep its stdout for `STRIPE_PRICE_ID=` — the line sits inside a banner, so don't take the literal last line). Then `node scripts/stripe-webhook-bootstrap.mjs https://<domain>` — pass the deployed origin as the argument (it falls back to `NEXT_PUBLIC_APP_URL` from `.env.local`); it registers the webhook with the right five events and prints `STRIPE_WEBHOOK_SECRET` exactly once (re-run with `--rotate` if lost). Put the three Stripe vars (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`) in Vercel and redeploy. (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env.example` is reserved and currently unused by the code — skip it.)
- **Wearables:** WHOOP is bring-your-own-credentials per user — just set `WHOOP_REDIRECT_URI=https://<domain>/api/whoop/callback` (its presence is what makes WHOOP appear in the vitals gallery). Oura/Fitbit each need one shared OAuth app (free dev accounts) whose registered redirect URI matches `OURA_REDIRECT_URI`/`FITBIT_REDIRECT_URI` character-for-character.
- **Hosted MCP** (connect Claude to the dashboard): leave `MCP_ENABLED` unset for now — everything 404s cleanly by design. Enabling later needs `MCP_ENABLED=true` (exact string), `SUPABASE_JWT_SECRET` (the project's *legacy* HS256 JWT secret), and `MCP_OAUTH_SIGNING_SECRET` (any long random string).
- **Sentry:** fully optional; `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT` all stay unset without harm.

## Ground rules

- Never commit `.env.local` or paste secret values into chat, logs, or files other than `.env.local` / Vercel env.
- Free tiers everywhere by default; ask before anything that could bill me (Stripe stays in test mode unless I say otherwise).
- If a step fails, read the error, fix the cause, and retry — don't skip verification.
- Finish with a short report: what's running where, which features are configured, which were skipped and the one-line instruction to enable each later.
