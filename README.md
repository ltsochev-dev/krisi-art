# Kristina Kostova Personal Portfolio Website

The portfolio site for artist Kristina Kostova: a public gallery and contact page
on the front, and a [Payload CMS](https://payloadcms.com) admin panel behind AWS
Cognito for managing albums, artworks and page content.

Built on Next.js 16 (App Router) + Payload 3, SQLite for data, S3 for media and
Resend for transactional email. It deploys as a single standalone container.

## Stack

| Concern     | Choice                                                      |
| ----------- | ----------------------------------------------------------- |
| Framework   | Next.js 16 (App Router, `output: 'standalone'`)             |
| CMS         | Payload 3 (`@payloadcms/next`), Lexical rich text            |
| Database    | SQLite (`@payloadcms/db-sqlite`)                             |
| Media       | S3 (`@payloadcms/storage-s3`), local disk as fallback        |
| Auth        | AWS Cognito Hosted UI (OIDC + PKCE) — no local passwords     |
| Email       | Resend (`@payloadcms/email-resend`)                          |
| Tests       | Vitest (integration), Playwright (e2e)                       |
| Node / pkg  | Node ≥ 20.9, pnpm 11                                         |

## Getting started

```bash
cp .env.example .env      # then fill in the values — see below
pnpm install
pnpm dev                  # http://localhost:3000
```

At minimum you need `DATABASE_URL` and `PAYLOAD_SECRET`. Without S3 credentials
uploads fall to local disk, and without `RESEND_API_KEY` emails are logged
instead of sent — so a fresh clone runs with no AWS account.

Signing in, however, does require Cognito: Payload's local login strategy is
disabled outright (`/api/users/login`, forgot/reset password, verify and
create-first-user all reject), and the admin panel's only entry point is the
Cognito button. See [Authentication](#authentication).

`.env.example` documents every variable, including the Cognito app client setup
and the optional S3-compatible endpoint overrides.

## Scripts

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `pnpm dev`          | Dev server. `pnpm devsafe` clears `.next` first.           |
| `pnpm build`        | Production build (standalone output).                      |
| `pnpm start`        | Serve the production build.                                |
| `pnpm lint`         | ESLint.                                                    |
| `pnpm test:int`     | Vitest integration tests (`tests/int`).                    |
| `pnpm test:e2e`     | Playwright e2e tests (`tests/e2e`).                        |
| `pnpm test`         | Both suites.                                               |
| `pnpm generate:types` | Regenerate `src/payload-types.ts` after schema changes.  |
| `pnpm generate:importmap` | Rebuild the admin import map after adding components. |
| `pnpm payload`      | Payload CLI (e.g. `pnpm payload migrate:create <name>`).   |
| `pnpm seed:media <dir>` | Bulk-import an album folder tree (`--dry-run` supported). |

## Content model

**Collections**

- **Albums** — gallery groupings; ordered, publishable, one flagged `isDefault`
  as the fallback for artworks with no home. It is created automatically on boot.
- **Artworks** — an image plus title, year, medium, dimensions, description and
  tags. Always belongs to an album.
- **Tags** — free-form labels on artworks.
- **Media** — uploads with `thumbnail`/`card`/`tablet`/`hero` sizes, alt text and
  caption. The `enabled` flag gates whether an image is publicly visible.
- **Contact submissions** — the contact form inbox, with delivery status and
  the error from a failed send. Submissions are stored whether or not email works.
- **Users** — mirrors of Cognito identities (`cognitoSub`, `roles`). Not editable
  as an identity source; the next login overwrites the mirrored fields.

**Globals** — `Homepage` (hero, gallery album picker, about section, SEO),
`ContactPage` (copy, contact details, notification recipients) and
`SiteSettings` (site name, logo, nav, socials, footer, SEO defaults).

## How it works

**Reads and caching.** The frontend never talks to Payload over HTTP. Pages call
`@/lib/content/queries`, which wraps the Local API in tagged `unstable_cache`
entries; the write-side hooks in `@/lib/hooks/revalidate` drop the matching tags
on every admin edit. Bulk operations can set `req.context.disableRevalidate` and
invalidate once at the end.

**Gallery filtering.** `GET /api/artworks/gallery?albums=…&limit=…&page=…` is a
Payload endpoint mounted on the `artworks` collection (the `/api/*` namespace
already belongs to Payload's catch-all route). It is public, published-only and
user-agnostic, which is what makes it cacheable.

**Media delivery.** Files are served through `/api/media/file/...` and streamed
from the bucket by the storage plugin, so no S3 URL is ever exposed and
`next.config.ts` needs no `images.remotePatterns` entry.

**GraphQL** is disabled — only the Local API and REST are used.

**Contact form.** A server action with hand-rolled validation (`@/lib/validation/contact`), a honeypot field and
an in-memory sliding-window rate limiter (`@/lib/rate-limit`). The limiter is
per-process and deliberately so: this deploys as a single container. Recipients
come from *Settings → Contact Page → Recipients*, falling back to
`CONTACT_NOTIFY_EMAIL` and then to `RESEND_FROM_ADDRESS`.

## Authentication

Cognito Hosted UI is the only identity provider. The flow lives in
`src/lib/auth/cognito` (`config`, `oidc`, `session`, `state`) with routes under
`src/app/(payload)/api/auth/cognito/{login,callback,logout}`.

- Authorization code grant with PKCE; works with public or confidential clients.
- Cognito **groups map to Payload roles** — `COGNITO_ADMIN_GROUP` → `admin`,
  `COGNITO_EDITOR_GROUP` → `editor`. Membership in neither denies access and
  creates no local user.
- Any recognised role gets into the admin panel; `admin` is required for the
  privileged operations in `src/lib/auth/access.ts`.
- `next.config.ts` redirects `/admin/logout` and `/admin/logout-inactivity` to
  the Cognito logout route, so signing out ends the Hosted UI session too — not
  just the local cookie.

App client configuration (callback/sign-out URLs, scopes) is spelled out in
`.env.example`.

## Migrations

Migrations live in `src/migrations` and are imported statically into
`payload.config.ts` as `db.prodMigrations`, so they run on boot **in production
only**. This is deliberate: `output: 'standalone'` traces only what `server.js`
imports, which excludes the Payload CLI, so `payload migrate` is not available in
the deployed image. Re-running is a no-op.

Create one with:

```bash
pnpm payload migrate:create <name>
```

Two caveats worth knowing:

- SQLite has a single writer, hence a single replica. If the database ever
  changes to one that allows more, move migrations back out into a separate step
  so concurrent boots cannot race.
- Never seed a deployed volume from a development database file. A schema-pushed
  database carries a `batch: -1` row in `payload-migrations`, and `migrate()`
  answers that with an interactive prompt that exits zero — having run nothing —
  when there is no TTY.

## Testing

```bash
pnpm test:int    # Vitest — API, Cognito, content and rate-limit suites
pnpm test:e2e    # Playwright — admin panel and frontend
```

Integration tests run against SQLite with no AWS credentials; helpers for seeding
users and media live in `tests/helpers`.

## Deployment

The `Dockerfile` builds the standalone Next.js output into a slim runtime image.
Provide the environment from `.env.example`, mount a volume for the SQLite file
and point `APP_URL` at the public origin a browser actually hits — the Cognito
redirect and sign-out URLs are derived from it.

`docker-compose.yml` runs that image as it is deployed — a single service, no
database container, with named volumes for the SQLite file (`/app/database`) and
the local-disk upload fallback (`/app/media`):

```bash
docker compose up --build
```

## Continuous deployment

`.github/workflows/deploy.yml` runs on every push:

1. **verify** — `pnpm typecheck`, `pnpm lint`, `pnpm test:int`. Nothing is built
   until these pass. The suite needs only `DATABASE_URL` and `PAYLOAD_SECRET`,
   both throwaway values set in the workflow.
2. **build** — pushes the image to `ghcr.io/<owner>/<repo>`, tagged with the full
   commit SHA (plus the branch name, and `latest` on `main`).
3. **deploy** — SSHes into the VPS, pulls that SHA and restarts the container.
   Automatic on `main`; for any other branch use **Actions → Deploy → Run
   workflow** and pick the branch.

Playwright is deliberately not in the pipeline: `tests/helpers` seeds users
through Payload in-process, so the suite needs to share a database file and
`PAYLOAD_SECRET` with the running server. Run `pnpm test:e2e` locally.

The deploy job opens a GitHub deployment for the `production` environment before
touching the box and closes it as `success` or `failure`, so the result shows on
the commit and under **Environments**.

### Server-side layout

The workflow never copies a compose file — the VPS owns it. In `$DEPLOY_DIR`
(default `/opt/krisi-art`) keep `docker-compose.yml` and the app's `.env`. The
compose file is the committed one with `build: .` swapped for an image
reference:

```yaml
services:
  app:
    image: ${IMAGE}:${IMAGE_TAG}
    restart: unless-stopped
    ports:
      - '3000:3000'
    env_file:
      - .env
    volumes:
      - database:/app/database
      - media:/app/media
    healthcheck: # unchanged from the committed file
      ...

volumes:
  database:
  media:
```

`IMAGE`/`IMAGE_TAG` come from `.env.deploy`, which `scripts/deploy-remote.sh`
rewrites on every deploy and passes as `docker compose --env-file .env.deploy`.
That flag only feeds compose's `${...}` substitution; the container's own
environment still comes from `env_file: .env`, which a deploy never touches.

The script waits for the compose healthcheck to report `healthy` before
succeeding — migrations run on container boot, so "started" is not "ready" — and
dumps the last 100 log lines if it does not. Only dangling images are pruned, so
the previous SHA stays on disk. Roll back without a pipeline run:

```bash
cd /opt/krisi-art
IMAGE_TAG=<previous-sha> docker compose --env-file .env.deploy up -d
```

### Repository configuration

Secrets (**Settings → Secrets and variables → Actions → Secrets**):

| Secret | Purpose |
| --- | --- |
| `DEPLOY_SSH_KEY` | Private key, PEM, no passphrase. Its public half goes in the deploy user's `~/.ssh/authorized_keys`. |
| `DEPLOY_HOST` | VPS hostname or IP. |
| `DEPLOY_USER` | SSH user; must be able to run `docker`. |
| `DEPLOY_KNOWN_HOSTS` | Optional but recommended: `ssh-keyscan -H <host>` output. Without it the host key is trusted on first use on every run. |

Variables (same page, **Variables** tab) — all optional:

| Variable | Default |
| --- | --- |
| `DEPLOY_DIR` | `/opt/krisi-art` |
| `DEPLOY_PORT` | `22` |
| `DEPLOY_SERVICE` | `app` |
| `APP_URL` | unset; recorded as the deployment's environment URL |

No registry credentials live on the VPS. The deploy step pipes the workflow
run's own `GITHUB_TOKEN` over SSH, logs into ghcr.io with it and logs out again
on exit; the token expires with the job.
