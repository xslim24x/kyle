# Self-hosting Kyle

Kyle is a single-employer planning application. It currently calculates base-rate wage estimates and configured employer costs. Ontario legal classification, statutory rules, overtime, public-holiday pay, and sleeping/on-call pay treatment remain unverified. See [implementation status](status.md).

## Docker Compose

Requirements: Docker Engine with Compose v2, a reverse proxy, and a hostname with HTTPS for public use.

1. Run `node scripts/init-env.mjs` from the repository root. It creates a mode-0600 `.env` with unique secrets and refuses to overwrite an existing file. Alternatively copy `.env.example` and populate every required value securely.
2. Edit `.env`: set `APP_ORIGIN` to the exact browser-facing origin, for example `https://schedule.example.com` (no trailing slash). Keep generated `POSTGRES_PASSWORD` and `CALENDAR_ENCRYPTION_KEY`. Use a hexadecimal database password to avoid URL-encoding issues.
3. Run `docker compose up --build -d`.
4. Check `docker compose ps` and request `/api/health` through the proxy. Open the planner and create an employee, coverage need, shift, and budget to verify the complete route.

In this cloud workspace, container builds cannot reach npm directly. After a verified host `npm ci --cache /workspace/.npm-cache`, the tested alternative is:

```sh
DOCKER_CONFIG=/workspace/.docker-cache node scripts/build-offline.mjs /workspace/.npm-cache
docker compose up --no-build -d
```

The helper uses the same Dockerfile and lockfile with npm's offline cache; integrity verification remains enabled. A missing cached artifact fails the build. Normal VPS builds can use the standard command above.

The app port binds to host loopback only, default port 3000. PostgreSQL has no host port. Put your proxy on the same host or use a private tunnel to that listener. Only expose the proxy's HTTPS listener. Live processes restart automatically; database state lives in the `database` volume. Avoid `docker compose down -v` on a deployment with data.

Example Caddy site for a proxy on the same host:

```caddy
schedule.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

The application checks browser mutation origins against `APP_ORIGIN`. The planner opens directly with no application login, password, PIN, or session cookies. Anyone who can reach the application can view and edit its data; configure access restrictions at your reverse proxy or network as needed.

Existing deployments can remove `APP_PASSWORD` and `AUTH_MODE` from `.env`. Those variables are no longer read. Legacy authentication tables may remain in an existing database but are no longer used or created; scheduling data requires no migration.

## Calendar connections

Use the Calendars page to add multiple HTTPS iCalendar subscription feeds, toggle visibility, and refresh. Feed URLs are encrypted with AES-256-GCM using `CALENDAR_ENCRYPTION_KEY`; credentials are never returned by the API. Preserve that key securely with your backups. Public internet destinations only are supported: private addresses, embedded URL credentials, non-HTTPS URLs, and unsafe redirects are rejected. Feeds are limited to 2 MB, three redirects, and bounded recurrence expansion.

Refresh is currently manual. The page shows last refresh and sync errors; a failed fetch retains previous appointments. Google imports cache four weeks before and twelve weeks after the selected week; refresh after navigating outside that range. Subscription feeds are expanded for the selected week. Views are Week and Day, so cached appointment coverage is not implied for an entire month.

For Google:

1. Enable Google Calendar API in your Google Cloud project and configure OAuth consent for your account.
2. Create a web OAuth client with callback `APP_ORIGIN/api/google/callback`, substituting your actual origin.
3. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env` and recreate the app container: `docker compose up -d app`.
4. In Calendars, connect Google, grant read-only calendar access, choose calendars, and refresh each one.

The implementation uses OAuth state, PKCE, and encrypted refresh-token storage. Live Google authorization must be tested with your credentials; it was not exercised during development. Disconnect removes the app's refresh token; cached calendars remain until removed. Revoke authorization in your Google account to invalidate the provider grant as well.

Published shifts have a separate revocable subscription URL. Treat the URL as a credential. Regenerating it invalidates the old URL. Drafts are excluded; shifts crossing workweeks are exported as week-specific segments from each published snapshot.

## Backups and restore

The backup service writes a PostgreSQL custom-format dump at startup and every 24 hours to `./backups`, with 14-day retention and owner-only permissions. Monitor service status and copy dumps off the VPS. Local backups alone do not protect against host loss. Back up `.env` separately and securely, particularly the calendar encryption key.

To restore, first stop app and backup services. Choose a known dump and restore into a **new empty database** for validation rather than overwriting the only existing copy:

```sh
docker compose stop app backup
docker compose exec -T db createdb -U kyle kyle_restore
docker compose exec -T db pg_restore -U kyle -d kyle_restore --no-owner --exit-on-error < backups/YOUR_DUMP.dump
```

Point the app's `DATABASE_URL` at `kyle_restore` through a local Compose override, start the app, and verify direct planner access, staff, shifts, budgets, publication snapshots, and calendar settings. Retain the original database until the restored copy is confirmed. Then choose which database to keep and update the deployment configuration explicitly. Restart backup with `PGDATABASE` matching the chosen database. Never restore untrusted dumps.

## Development and checks

Use Node.js 24 and PostgreSQL 17. `npm ci` installs the locked dependency graph. For a disposable local database, bind it to loopback only:

```sh
docker run -d --name kyle-dev-db -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=kyle -p 127.0.0.1:55432:5432 postgres:17-alpine
docker exec kyle-dev-db createdb -U postgres kyle_browser
```

This trust-authenticated container is for disposable local development only; production Compose uses a password and an isolated network.

Set `DATABASE_URL` and `APP_ORIGIN=http://localhost:5173`, then run `npm run dev`. `CALENDAR_ENCRYPTION_KEY` is required only when using calendar connections. Environment variables are read from the process; use your shell or Node's `--env-file` option when running outside Compose.

```sh
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/kyle npm test
npm run build
npm run test:browser
npm run check:format
```

Tests must target a disposable database: persistence tests modify schedules and publication data. Browser tests use the separate `kyle_browser` database with direct access; override `BROWSER_DATABASE_URL` if necessary. They use `/usr/bin/chromium` by default; set `CHROMIUM_PATH` for your installed browser. Never point either suite at a production database.

Production serving uses `npm start` after `npm run build`. Initial schema creation is idempotent and runs at startup. Scheduling state is stored as one versioned JSONB document, appropriate for this single employer; compare-and-swap writes prevent lost updates. Publication uses a transaction and stores immutable-at-publication inputs, so subsequent edits do not silently rewrite a published estimate. Republishing explicitly replaces the published snapshot for that week.
