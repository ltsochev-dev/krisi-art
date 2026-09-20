# Kristina Kostova Personal Portfolio Website

The portfolio site for artist Kristina Kostova: a public gallery and contact page
on the front, and a [Payload CMS](https://payloadcms.com) admin panel behind AWS
Cognito for managing albums, artworks and page content.

Built on Next.js 16 (App Router) + Payload 3, SQLite for data, S3 for media and
Resend for transactional email. It deploys as a single standalone container.

## Stack

| Concern    | Choice                                                   |
| ---------- | -------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, `output: 'standalone'`)          |
| CMS        | Payload 3 (`@payloadcms/next`), Lexical rich text        |
| Database   | SQLite (`@payloadcms/db-sqlite`)                         |
| Media      | S3 (`@payloadcms/storage-s3`), local disk as fallback    |
| Auth       | AWS Cognito Hosted UI (OIDC + PKCE) — no local passwords |
| Email      | Resend (`@payloadcms/email-resend`)                      |
| Tests      | Vitest (integration), Playwright (e2e)                   |
| Node / pkg | Node ≥ 20.9, pnpm 11                                     |

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

| Command                   | What it does                                              |
| ------------------------- | --------------------------------------------------------- |
| `pnpm dev`                | Dev server. `pnpm devsafe` clears `.next` first.          |
| `pnpm build`              | Production build (standalone output).                     |
| `pnpm start`              | Serve the production build.                               |
| `pnpm lint`               | ESLint.                                                   |
| `pnpm test:int`           | Vitest integration tests (`tests/int`).                   |
| `pnpm test:e2e`           | Playwright e2e tests (`tests/e2e`).                       |
| `pnpm test`               | Both suites.                                              |
| `pnpm generate:types`     | Regenerate `src/payload-types.ts` after schema changes.   |
| `pnpm generate:importmap` | Rebuild the admin import map after adding components.     |
| `pnpm payload`            | Payload CLI (e.g. `pnpm payload migrate:create <name>`).  |
| `pnpm seed:media <dir>`   | Bulk-import an album folder tree (`--dry-run` supported). |

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
come from _Settings → Contact Page → Recipients_, falling back to
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

## Commissions

Private file delivery for finished work. A commission is a titled set of files —
images, PDFs or archives, up to 500 MB each — that the artist uploads in the
admin and hands over as a single link, `/commission/<uuid>`. Whoever opens it
gets the file list and downloads each file through a short-lived presigned S3
URL. Uploads go from the browser straight to S3 with a presigned `PUT`, so
deliverables never transit the VPS in either direction.

**Possession of the UUID is the authorisation.** Exactly as with
`/invoice/<uuid>`: the collection is editors-only and the public read is one
deliberate `overrideAccess: true` in `src/lib/content/commissions.ts`. On top of
that a commission may carry an optional **password** — scrypt-hashed, plaintext
never stored, and unlocking sets an httpOnly cookie scoped to that one
commission's path — and an optional **expiry date**. It also stays
`enabled: false` until the artist flips it, so a half-finished upload set is
never briefly live. Unknown, disabled and expired links all 404 identically, so
the page never confirms that a UUID was ever valid.

**Two buckets, not two prefixes.** Media lives in `S3_BUCKET` and is public by
design — `S3_CDN_URL` puts a CloudFront distribution in front of it so gallery
image bytes never touch this server. Commission deliverables must never be
reachable that way, so they live in their own bucket, `S3_COMMISSIONS_BUCKET`,
with public access blocked, no bucket policy and no CDN. A presigned URL is
therefore the only read path by construction rather than by configuration — a
prefix inside the media bucket would have left client deliverables one CDN
misconfiguration away from being public.
Provisioning it is recorded in
[`docs/plans/commissions-infra.md`](docs/plans/commissions-infra.md), which is
the only place that infrastructure is written down; none of it is in Terraform.
Leave `S3_COMMISSIONS_BUCKET` unset and the commission endpoints answer "file
storage is not configured" while the rest of the app is unaffected.

**The bucket needs a CORS rule.** The presigned `PUT` is issued by this app but
executed by the browser against `https://<bucket>.s3.<region>.amazonaws.com`,
which is cross-origin. Without a `PUT` rule listing the exact origin the admin
panel is served from, the upload fails with an opaque `status === 0` and no
response body, while the same request through `curl` succeeds — `curl` does not
enforce CORS, so the bucket looks fine from a terminal. Downloads are top-level
navigations rather than XHR and need no rule. The current origins and the fact
that `put-bucket-cors` replaces the whole configuration instead of merging are
in the infra doc.

**A gallery commission's grid goes through `next/image`.** The tiles are
`/_next/image` requests pointing at the presigned URL of the original, so this
server fetches each photograph from S3 once, resizes it to tile size and caches
the result on disk — a five-megabyte JPEG becomes an eighteen-kilobyte WebP, and
an album of 150 of them stops being a gigabyte of downloads and 150
full-resolution decodes in the visitor's browser. Nothing is stored in the
bucket and no document changed, so it applies to albums uploaded long before it.
Two consequences worth knowing: **`next.config.ts` must list the commissions
bucket's host under `images.remotePatterns`** (it is hardcoded there for the same
build-time reason the CDN host is, and without it every tile 400s), and opening a
photo still serves the untouched original, which is what the page's footnote
tells the visitor.

**Presigned lifetimes** default to 300 seconds for downloads — the URL is handed
to the browser as JSON and navigated to at once, so it only has to survive one
click — and 900 seconds for uploads, which is a whole `PUT` on a slow
connection. Override with `COMMISSION_DOWNLOAD_TTL_SECONDS` and
`COMMISSION_UPLOAD_TTL_SECONDS`. A gallery's image URLs are the exception: they
are signed against a rolling 12-hour window (`COMMISSION_GALLERY_WINDOW_SECONDS`)
so that every render inside one produces byte-identical URLs, which is what lets
both the browser and the image optimiser cache what they made from them.

**Views and downloads are logged locally**, in the `commission-access-log`
collection, and shown on the commission document. No analytics service is
involved. The log stores the client's **raw IP address, unhashed and retained
indefinitely** — the site owner's explicit decision, not an oversight, and there
is no prune job. That is personal data under the GDPR, so the **privacy policy
needs a line covering it**: edit the Privacy Policy page in the admin (_Pages →
Privacy Policy_, slug `privacy`). Note that the IP is only as trustworthy as the
reverse proxy in front of the container and is trivially spoofable by a direct
caller — it is forensic colour, not access control.

Deployment: `S3_COMMISSIONS_BUCKET` belongs in the VPS `.env` alongside the other
S3 variables. It is a runtime value, not a build arg and not a GitHub Actions
variable, and a deploy never rewrites that file — see
[Server-side layout](#server-side-layout). Region, credentials, endpoint and
path-style are shared with the media bucket; there is one S3 client.

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

### TLS, HSTS and the canonical host

The container speaks plain HTTP on `3000` and is deliberately unaware of TLS.
Certificates, the `Strict-Transport-Security` header and the `www` redirect all
belong to the reverse proxy in front of it — that is the layer that terminates
TLS, and putting either in the app would mean a per-request hop that only
re-derives what the proxy already knows.

`www` is redirected to the apex rather than the other way round, and `APP_URL`
must be the apex form to match: the canonical URLs in `<head>`, the `Sitemap:`
line in `/robots.txt` and every `<loc>` in `/sitemap.xml` are all built from it,
so a `www` origin there would point crawlers at the hostname being redirected
away from.

nginx:

```nginx
# www -> apex. 308 rather than 301: it is the permanent redirect that also
# guarantees the method and body survive, which matters for the contact form.
server {
    listen 443 ssl;
    server_name www.kristinakostova.com;
    # Certificate required here too — a browser validates TLS before it ever
    # sees the redirect.
    return 308 https://kristinakostova.com$request_uri;
}

server {
    listen 443 ssl;
    server_name kristinakostova.com;

    # Deliberately short to begin with. Verify that every path — the site, the
    # admin, the CloudFront media, anything else on a subdomain — is reachable
    # over HTTPS, then raise it to 63072000 (two years). Ramping up is the point:
    # a browser that has cached a long max-age against a broken subdomain cannot
    # be told to forget it.
    #
    # `always` so the header is sent on error responses too, not just 2xx/3xx.
    add_header Strict-Transport-Security "max-age=300; includeSubDomains" always;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Port 80 exists only to hand both hostnames to HTTPS.
server {
    listen 80;
    server_name kristinakostova.com www.kristinakostova.com;
    return 308 https://kristinakostova.com$request_uri;
}
```

Do not add `preload` to the header. It enrolls the domain in a list baked into
browser binaries: removal takes months, and every subdomain must serve valid
HTTPS for as long as it is listed.

### Repository configuration

Secrets (**Settings → Secrets and variables → Actions → Secrets**):

| Secret               | Purpose                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DEPLOY_SSH_KEY`     | Private key, PEM, no passphrase. Its public half goes in the deploy user's `~/.ssh/authorized_keys`.                    |
| `DEPLOY_HOST`        | VPS hostname or IP.                                                                                                     |
| `DEPLOY_USER`        | SSH user; must be able to run `docker`.                                                                                 |
| `DEPLOY_KNOWN_HOSTS` | Optional but recommended: `ssh-keyscan -H <host>` output. Without it the host key is trusted on first use on every run. |

Variables (same page, **Variables** tab) — all optional:

| Variable                            | Default                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEPLOY_DIR`                        | `/opt/krisi-art`                                                                                                                                 |
| `DEPLOY_PORT`                       | `22`                                                                                                                                             |
| `DEPLOY_SERVICE`                    | `app`                                                                                                                                            |
| `APP_URL`                           | unset; recorded as the deployment's environment URL                                                                                              |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | unset; browser PostHog token, passed to `docker build` as a build arg. A variable and not a secret on purpose — it ships to every visitor anyway |
| `NEXT_PUBLIC_POSTHOG_HOST`          | unset; PostHog ingestion origin, e.g. `https://eu.i.posthog.com`                                                                                 |

Both `NEXT_PUBLIC_*` entries are **build-time only**. `next build` replaces every
`process.env.NEXT_PUBLIC_*` read with a literal in the JS it emits, so the
browser bundle is fixed the moment the image is built and the VPS `.env` cannot
influence it. Leave either one unset and PostHog initialises with `undefined`,
which `instrumentation-client.ts` treats as "not configured" — in production it
skips silently, with no log line. The trade-off is that an image built with one
project's token belongs to that environment only and cannot be promoted to
another.

No registry credentials live on the VPS. The deploy step pipes the workflow
run's own `GITHUB_TOKEN` over SSH, logs into ghcr.io with it and logs out again
on exit; the token expires with the job.
