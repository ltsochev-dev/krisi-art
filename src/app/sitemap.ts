/**
 * `/sitemap.xml`.
 *
 * At the app root for the same reason as `./robots.ts` — a metadata route inside
 * a route group is not registered.
 *
 * Nothing but composition: `@/lib/content/sitemap` decides which documents are
 * in it, `@/lib/seo/sitemap` decides how they are spelled.
 *
 * `force-dynamic` for the reason the frontend layout gives: this reads the
 * database through the Payload Local API, and the Docker builder stage has
 * neither a `PAYLOAD_SECRET` nor a migrated volume, so a build-time render would
 * fail. It also means `APP_URL` is read from the container's runtime environment
 * rather than frozen at build. The `unstable_cache` entry behind
 * `getSitemapContent` is what keeps the per-request cost to nothing, and the
 * Payload hooks in `@/lib/hooks/revalidate` drop it when content changes.
 */
import type { MetadataRoute } from 'next'

import { getSitemapContent } from '@/lib/content/queries'
import { getSiteUrl } from '@/lib/seo/metadata'
import { toSitemapEntries } from '@/lib/seo/sitemap'

export const dynamic = 'force-dynamic'

const sitemap = async (): Promise<MetadataRoute.Sitemap> =>
  toSitemapEntries({ content: await getSitemapContent(), siteUrl: getSiteUrl() })

export default sitemap
