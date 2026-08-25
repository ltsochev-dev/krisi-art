import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { resendAdapter } from '@payloadcms/email-resend'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Albums } from './collections/Albums'
import { Artworks } from './collections/Artworks'
import { ContactSubmissions } from './collections/ContactSubmissions'
import { Media } from './collections/Media'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { ContactPage } from './globals/ContactPage'
import { Homepage } from './globals/Homepage'
import { SiteSettings } from './globals/SiteSettings'
import { getS3Config, joinCdnFileURL } from './lib/aws/s3'
import { ensureDefaultAlbum } from './lib/content/default-album'
import { ensureLegalPages } from './lib/content/legal-pages'
import { migrations } from './migrations'
import { Testimonials } from './collections/Testimonials'
import { Pages } from './collections/Pages'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Only configure Resend when an API key is present, so local dev and tests fall
// back to Payload's built-in adapter (which logs emails instead of sending).
const email = process.env.RESEND_API_KEY
  ? resendAdapter({
      apiKey: process.env.RESEND_API_KEY,
      defaultFromAddress: process.env.RESEND_FROM_ADDRESS || 'noreply@krisi.art',
      defaultFromName: process.env.RESEND_FROM_NAME || 'Krisi Art',
      // Set in non-production to route every email to a single inbox.
      ...(process.env.RESEND_OVERRIDE_RECIPIENT
        ? { overrideRecipientAddress: process.env.RESEND_OVERRIDE_RECIPIENT }
        : {}),
    })
  : undefined

/**
 * Uploads go to S3 whenever a bucket is configured; otherwise Payload keeps them
 * on local disk so a fresh clone and the integration tests work without AWS
 * credentials. `getS3Config` (which also serves the presigned-URL helpers) is the
 * single place env parsing happens, but it throws on missing values — hence the
 * guard before calling it.
 *
 * How files are *served* then depends on whether `S3_CDN_URL` is set:
 *
 * - Set: `disablePayloadAccessControl` turns off Payload's file route and
 *   `generateFileURL` rewrites every `url` (originals and every derivative) to
 *   the CDN. Bytes go browser → CloudFront → bucket, and this server is out of
 *   the image path entirely. `next.config.ts` needs the host in
 *   `images.remotePatterns` for the `next/image` call sites.
 * - Unset: files stream through `/api/media/file/...`, where the plugin pulls
 *   each object from the bucket and pipes it to the client. Correct, and fine
 *   locally, but it puts this process in the byte path for every thumbnail.
 *
 * Note the trade `disablePayloadAccessControl` makes: objects become fetchable
 * by anyone holding the URL, bypassing the `media.read` check. That is safe for
 * this collection specifically — `read` is already `anyone`, and the `enabled`
 * readiness gate is enforced in `@/lib/content/gallery` rather than in access
 * control (see the note on the field). A disabled image's URL still resolves; it
 * simply never appears on the site.
 */
const storage = process.env.S3_BUCKET?.trim()
  ? (() => {
      const { bucket, cdnUrl, endpoint, forcePathStyle, region } = getS3Config()
      const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
      const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()

      return s3Storage({
        bucket,
        collections: {
          media: cdnUrl
            ? {
                disablePayloadAccessControl: true,
                // `filename` arrives already resolved to the requested size, so
                // this runs once per derivative and needs no size handling of
                // its own. `prefix` is the per-document folder when one is set.
                generateFileURL: ({ filename, prefix }) =>
                  joinCdnFileURL(cdnUrl, filename, prefix),
              }
            : true,
        },
        config: {
          // Omitted when absent so the default AWS provider chain still applies.
          ...(accessKeyId && secretAccessKey
            ? {
                credentials: {
                  accessKeyId,
                  secretAccessKey,
                  ...(process.env.AWS_SESSION_TOKEN?.trim()
                    ? { sessionToken: process.env.AWS_SESSION_TOKEN.trim() }
                    : {}),
                },
              }
            : {}),
          // Only for S3-compatible providers (MinIO, R2, Spaces).
          ...(endpoint ? { endpoint, forcePathStyle } : {}),
          region,
        },
      })
    })()
  : undefined

export default buildConfig({
  admin: {
    components: {
      // Payload's own login form is gone (the users collection disables the
      // local strategy), so this is the only way into the admin panel.
      beforeLogin: ['@/components/admin/CognitoLoginButton#CognitoLoginButton'],
      logout: {
        Button: '@/components/admin/CognitoLogoutButton#CognitoLogoutButton',
      },
    },
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Albums, Artworks, Tags, Media, ContactSubmissions, Users, Testimonials, Pages],
  globals: [Homepage, ContactPage, SiteSettings],
  // The app only talks to Payload through the Local API and REST, so the
  // GraphQL endpoint and its playground stay off.
  graphQL: {
    disable: true,
  },
  editor: lexicalEditor(),
  email,
  /**
   * Artworks require an album, so the fallback album has to exist. Failing here
   * would take the whole app down, and `getDefaultAlbumId` creates it lazily on
   * first use anyway — so log and carry on.
   *
   * The legal pages are seeded on the same terms: a missing Terms or Privacy
   * document is a broken footer link, not a reason to refuse to boot.
   */
  onInit: async (payload) => {
    try {
      await ensureDefaultAlbum({ payload })
    } catch (error) {
      payload.logger.error({ err: error }, 'Could not ensure the default album exists.')
    }

    try {
      await ensureLegalPages({ payload })
    } catch (error) {
      payload.logger.error({ err: error }, 'Could not ensure the legal pages exist.')
    }
  },
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || '',
    },
    /**
     * Migrations run on boot in production, and only there.
     *
     * The adapter skips its dev schema push whenever `NODE_ENV=production`, so
     * without this a deployed container starts against whatever schema the
     * volume happens to hold and fails on the first query. The `payload migrate`
     * CLI is not an option in the deployed image: `output: 'standalone'` traces
     * only what `server.js` imports, which excludes the CLI bin, the `src` tree
     * and the dev dependencies it needs. Importing the array statically is what
     * gets the migration code bundled into the server build.
     *
     * Safe to re-run: `migrate()` skips any migration already recorded in
     * `payload-migrations`, so restarts are no-ops. A failing migration runs in
     * a transaction and then calls `process.exit(1)`, so the container dies
     * rather than serving a half-migrated schema.
     *
     * Viable because SQLite has a single writer and therefore a single replica.
     * On a database that allows more than one, move this back out into a
     * separate migrate step so concurrent boots cannot race.
     *
     * One caveat worth knowing: a database that was ever schema-pushed carries a
     * `batch: -1` row in `payload-migrations`, and `migrate()` answers that with
     * an interactive confirm prompt whose cancel path is `process.exit(0)`. With
     * no TTY that exits zero having run nothing. Never seed the deployed volume
     * from a development database file.
     */
    prodMigrations: migrations,
  }),
  sharp,
  plugins: storage ? [storage] : [],
})
