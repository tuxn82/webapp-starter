# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Read `HANDOFF.md` first** for this app's status, open tasks and decisions. Keep it updated when status changes.

This app was created from **Webapp Starter**, a secure Node.js base app for ECIT PaaS. It provides:
- Express 5 with EJS server-side rendering
- PostgreSQL
- login and user administration with the roles admin and user
- an optional IP allowlist

The owner builds their own features on top. `views/dashboard.ejs` is the landing page where new features get a tile.

Everything the user sees is written in **Danish**, including UI text, error messages and log messages. Keep it that way unless the owner asks otherwise. Code identifiers are in English.

## Commands

```bash
npm install
npm start
npm run create-admin -- navn@firma.dk "Fulde Navn"
```

- `npm start` runs `node server.js` on port 8080 by default.
- `create-admin` prints a one-time temporary password.

Local run (needs a PostgreSQL):

```bash
DATABASE_URL=postgresql://localhost/app ADMIN_EMAIL=admin@test.dk ADMIN_PASSWORD='StartKode-12345' PORT=18080 npm start
```

- There is no linter and no automated test suite.
- Verify changes end-to-end with `curl` and a cookie jar. Every POST must send `_csrf`, which you scrape from the form's hidden input.
- With `ALLOWED_IPS` set, send `X-Forwarded-For: <allowed ip>`.
- In production, also send `X-Forwarded-Proto: https`. Without it, the `Secure` session cookie is not set.

## Architecture

**Startup** (`server.js`):
1. `migrate()`
2. Bootstrap the first admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`. This only happens when the `users` table is empty. The admin is created with `must_change_password`.
3. `createApp()` and listen.

`src/config.js` reads all environment variables:
- It throws on startup if `DATABASE_URL` is missing.
- It also throws in production if `SESSION_SECRET` is missing or shorter than 32 characters.

**Migrations** are an append-only array in `src/db.js` (`MIGRATIONS`).
- Applied ids are tracked in `schema_migrations`.
- Each migration runs in a transaction under a `pg_advisory_lock`.
- **To add tables for a new feature, append an entry with the next id.** Never edit an entry that has already been applied.

**The middleware order in `src/app.js` matters:**

`/healthz` → IP allowlist → helmet (strict CSP) → `/static` → urlencoded body → session (PostgreSQL, table `user_sessions`) → `Cache-Control: no-store` → `flash` → `csrf` → `loadUser` → routes

- **IP allowlist** (`src/ipAllowlist.js`):
  - It uses `net.BlockList` with `ALLOWED_IPS` (IPs and CIDRs). An empty list means it is off.
  - It relies on `trust proxy = 1`, so `req.ip` is the address NGINX appended. A client-supplied `X-Forwarded-For` therefore can't spoof it.
  - This is only safe because the Node.js node has no public IP and no SLB access.
- **CSRF:** every `<form method="post">` must include `<input type="hidden" name="_csrf" value="<%= csrfToken %>">`.
- **`loadUser`:** reloads the user on every request, so deactivation and role changes apply immediately.
- **`requireLogin`:** forces `/account/password` while `must_change_password` is set.
- **`requireAdmin`:** guards `/admin`.
- **Adding a feature:**
  1. Create a router in `src/routes/`.
  2. Mount it in `src/app.js` before the 404 handler.
  3. Put `requireLogin` (and `requireAdmin` if needed) on it.
  4. Add views under `views/`, including `partials/header` and `partials/footer`.

**CSP:** the CSP allows only `'self'`. Inline `<script>`, inline `<style>` and `style=""` are blocked. Put CSS and JS in `public/`, which is served at `/static`. `public/style.css` defines light and dark theme tokens and the classes used across the views (`card`, `tile`, `grid`, `alert`, `badge`, `table-wrap`).

**Data access:** use parameterized `pg` queries through a module per entity. `src/users.js` is the pattern to follow.

**Passwords** use `crypto.scrypt`. The hash is stored as `scrypt$N$r$p$salt$hash`, and the minimum length is 12. Sessions are revoked with `users.destroySessions()` on password change and reset and on deactivation.

**Admin invariants:** an admin cannot deactivate or demote themselves, and there must always be at least one active admin.

## Platform (ECIT PaaS, Virtuozzo/Jelastic 8.x)

**Topology** (`manifest.jps`):
- `bl` is NGINX with a public IPv4 and Let's Encrypt.
- `cp` is Node.js (pm2, `APP_FILE=server.js`, port 8080). It has no public IP and no SLB access.
- `sqldb` is PostgreSQL, reached internally as host `sqldb`. Database and role are both `app`.

**Configuration:** config lives in environment variables on the `cp` layer, documented in `README.md`. After changing them, click **Apply** and restart the node.

**Deploys:** deploy from Git `main` via the Deployments panel on `cp`.

**Server access:** the platform API only accepts the token as a `session` query or form parameter, not as an HTTP header. Server-side work (SSH to nodes, logs, `psql`) should therefore be done from a local Claude Code session with the owner's SSH key, not from a cloud session.

`manifest.jps` has not yet been validated against the platform. The checklist is in `README.md`.
