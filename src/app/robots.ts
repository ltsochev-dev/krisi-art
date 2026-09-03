/**
 * `/robots.txt`.
 *
 * Sits at the app root rather than inside `(frontend)` with the rest of the
 * public site. Route groups do not appear in the URL, but a metadata route
 * placed in one is not registered either — verified against 16.3.0, where
 * `(frontend)/robots.ts` left `/robots.txt` falling through to the `[slug]`
 * copy-page route and 404ing.
 *
 * A generated route rather than a static `robots.txt` file so the `Sitemap:`
 * line can be built from the configured origin. That makes it `force-dynamic`
 * for the same reason as `./sitemap.ts`: `APP_URL` reaches the container through
 * compose's `env_file`, which is runtime only, so an origin baked in at build
 * time would be whatever the Docker builder stage happened to have — nothing.
 *
 * What is closed off:
 *
 * - `/admin` — the Payload admin. Behind Cognito, so a crawler only ever gets a
 *   redirect to the Hosted UI, but there is no reason to spend crawl budget on
 *   it.
 * - `/api/` — the Payload REST and GraphQL surface. JSON, not pages.
 * - `/invoice/` — per-client invoices at an unguessable UUID. The route already
 *   sends `noindex` (see `(invoice)/invoice/[uuid]/layout.tsx`); this keeps a
 *   crawler that somehow has the link from fetching it at all. Note that
 *   robots.txt is public, so this discloses only the route shape, never a UUID.
 *
 * The one carve-out is `/api/media/file/`, which is where uploads are served
 * from when `S3_CDN_URL` is unset. Those URLs are the page images and the
 * `og:image` on that path, and a blanket `/api/` block would keep them out of
 * image search and out of link previews for crawlers that check robots.txt
 * before fetching a card image. Longest-match wins for the crawlers that
 * matter, so the `Allow` beats the `Disallow` above it.
 */
import type { MetadataRoute } from 'next'

import { getSiteUrl } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'

const robots = (): MetadataRoute.Robots => {
  const siteUrl = getSiteUrl()

  return {
    rules: {
      allow: ['/', '/api/media/file/'],
      disallow: ['/admin', '/api/', '/invoice/'],
      userAgent: '*',
    },
    // Absolute or omitted: the directive takes a full URL, and a crawler that
    // is handed a relative one just drops the line.
    ...(siteUrl ? { sitemap: new URL('/sitemap.xml', siteUrl).toString() } : {}),
  }
}

export default robots
