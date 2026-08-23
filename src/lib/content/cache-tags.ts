/**
 * Cache tags shared between the read helpers in `./queries.ts` (which tag their
 * `unstable_cache` entries) and the Payload hooks in `@/lib/hooks/revalidate`
 * (which invalidate them on write). Keep the two in sync through this module —
 * never hand-write a tag string at either end.
 */
export const CACHE_TAGS = {
  albums: 'albums',
  artworks: 'artworks',
  contactPage: 'contact-page',
  homepage: 'homepage',
  media: 'media',
  siteSettings: 'site-settings',
  tags: 'tags',
} as const

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS]

/**
 * Anything the homepage renders. A change to an album, an artwork or the media
 * behind one has to bust the homepage's own entry too, since the gallery and
 * about grids are cached as part of it.
 */
export const HOMEPAGE_TAGS: readonly CacheTag[] = [
  CACHE_TAGS.homepage,
  CACHE_TAGS.albums,
  CACHE_TAGS.artworks,
  CACHE_TAGS.media,
]
