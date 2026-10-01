# Rocket Canvas account sign-in

Rocket Canvas signs users in with the same account and password as this website. Its **Register** button opens `https://www.agent-tech.ai/login`; password recovery opens `/login?mode=forgot`. The desktop never receives the Supabase service-role key. Registration does not allocate company-funded AI credits.

## Server contract

- `POST /api/desktop-auth/sign-in`: `{identifier,password}` returns `{token,email,expiresAt}`. Tokens are opaque, 32 random bytes, and expire after 30 days.
- `GET /api/desktop-auth/session`: `Authorization: Bearer <desktop token>` returns `{email,expiresAt}` only when active and the website account still exists.
- `POST /api/desktop-auth/sign-out`: same header, revokes the token; returns 204.
- Sessions live in `desktop_private.sessions` as SHA-256 hashes, with RLS enabled. Service-role-only SECURITY INVOKER functions expose the minimal operations through the existing server REST client. Do not expose `desktop_private` through the Data API.
- Login limits are shared through Postgres: 5 attempts/account and 30/client IP per 15 minutes. Identifiers are HMAC hashed. On Vercel the server uses the platform's `x-vercel-forwarded-for` header. A non-Vercel host uses one conservative shared IP bucket until a trusted proxy integration is reviewed.
- Credentials use the existing website/Supabase verifier, including legacy account synchronization and the existing provisioned username accounts. No new funded AI user is created.

## Environment

Use the website's existing server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The limiter uses `AGENTECH_SESSION_SECRET` when available, otherwise the existing service key. No additional public key or desktop secret is needed. Keep all secrets out of source archives.

## Verified local checks

```powershell
pnpm install --frozen-lockfile
node --test scripts/auth-sign-in.test.mjs scripts/desktop-credentials.test.mjs scripts/desktop-session-store.test.mjs scripts/desktop-auth.test.mjs scripts/auth-entry-mode.test.mjs
pnpm test
pnpm typecheck
pnpm build
```

The database test runs the actual migration in disposable PGlite Postgres, including permission checks under `service_role`, `anon`, and `authenticated`. It does not modify production. Run Supabase security/performance advisors and live permission checks after the production migration.

## Deployment order — requires publication authorization

1. Apply `supabase/migrations/20261001005658_desktop_sessions.sql` to Agentech Website (`xwqvnyyzevyqusdddwbu`). Verify anon/authenticated cannot read the private tables or execute the RPCs. Do not grant those roles access.
2. Publish this website commit. Confirm `/api/desktop-auth/session` responds with JSON 401 without credentials. Complete one live sign-in/logout with a user-operated test account; never put passwords in logs or chat.
3. Deploy the matching Agentech backend. It requires both the existing AI access code and the desktop session (`X-Agentech-Session`). It verifies the session through the fixed website endpoint before billing or contacting a model provider. Its `/healthz` stays public.
4. Test funded chat with the real account and existing access code. Confirm allowance is unchanged by rejected authentication. Personal Codex/Gemini connections require app login but keep their own billing.
5. Distribute/install the matching Windows app only after these checks. Existing Build48 clients lack the new session header and cannot use the updated funded backend, so coordinate their update.

The companion migration `20261001010031_desktop_session_cleanup_schedule.sql` enables pg_cron and schedules `select public.desktop_session_cleanup();` hourly. Each run deletes at most 1,000 expired/revoked sessions and 1,000 expired rate-limit buckets. If volume exceeds that, run it more often. The function is not callable by public clients. Migration filenames match the versions recorded during production deployment through Supabase MCP.

## Desktop privacy and operation

Windows safeStorage encrypts saved desktop sessions. Passwords are not saved. The app checks online at startup, revalidates active sessions, and gates IPC/MCP in the main process. Stop, pending-queue clearing, and safe disconnect remain available on the locked screen. Active robot recovery finishes before account changes disconnect the device.

Each account has its own local data directory, Electron browser partition, and Codex home. Users reconnect Codex in their account; the machine's previous global Codex login is not automatically inherited. Settings offers an explicit one-time import of pre-login chats and encrypted provider settings. Original files are preserved, and importing into an existing profile is rejected. Old device preferences/history remain in the original browser partition.

The account token can be sent only to loopback backends or the exact HTTPS origins `agent-tech.ai`, `www.agent-tech.ai`, and `chat.agent-tech.ai`. These are allowed deployment targets; their presence in the allowlist does not mean a backend is deployed there. The root website URL works as a backend URL only if its `/v1` routes are routed to the funded backend. Review any different company hostname before changing the app allowlist.

Keep these endpoints and the session schema available while deployed desktop clients depend on them. Do not roll the website back to a revision that removes the endpoints without coordinating the desktop and backend rollback.
