/**
 * Sitemap assembly — the counterpart to `./metadata`, and pure for the same
 * reason: the content comes in as data, so the interesting decisions here can be
 * tested without a Payload instance or a Next server context.
 *
 * `@/lib/content/sitemap` supplies the slugs and timestamps; this decides which
 * routes exist, what they are worth relative to each other, and how they are
 * spelled as absolute URLs.
 */
import type { MetadataRoute } from 'next'

import type { SitemapContent } from '@/lib/content/sitemap'

/**
 * No `changeFrequency` anywhere, and `lastModified` only where it is genuinely
 * known.
 *
 * Google ignores `changefreq` outright, and it discounts `lastmod` across an
 * entire site once it decides the values are not trustworthy — so a guessed
 * timestamp on the homepage would cost the real ones on the album pages. The
 * three fixed routes below aggregate globals and several collections between
 * them; there is no single honest timestamp for any of them, so they carry none.
 *
 * `priority` is relative within this one document and is only a hint about which
 * pages matter most here. It is not a ranking signal.
 */
const FIXED_ROUTES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/gallery', priority: 0.9 },
  { path: '/contact', priority: 0.6 },
]

const ALBUM_PRIORITY = 0.8

/** Copy pages — the terms and privacy sort of thing. Real, but not the draw. */
const PAGE_PRIORITY = 0.3

/**
 * Every public URL, absolute against `siteUrl`.
 *
 * `/admin`, `/api` and `/invoice` are absent by construction — nothing here can
 * emit them — which matches the `disallow` list in `@/app/robots`.
 *
 * `siteUrl` is optional because `getSiteUrl` is: with no origin configured the
 * answer is an empty `<urlset>`, not a document full of relative locations that
 * every crawler would reject. Same call as `./metadata` makes for `og:image`.
 */
export const toSitemapEntries = ({
  content,
  siteUrl,
}: {
  content: SitemapContent
  siteUrl: undefined | URL
}): MetadataRoute.Sitemap => {
  if (!siteUrl) {
    return []
  }

  const absolute = (path: string): string => new URL(path, siteUrl).toString()

  return [
    ...FIXED_ROUTES.map(({ path, priority }) => ({ priority, url: absolute(path) })),
    ...content.albums.map((album) => ({
      lastModified: album.updatedAt,
      priority: ALBUM_PRIORITY,
      url: absolute(`/gallery/${album.slug}`),
    })),
    ...content.pages.map((page) => ({
      lastModified: page.updatedAt,
      priority: PAGE_PRIORITY,
      url: absolute(`/${page.slug}`),
    })),
  ]
}
