/**
 * Sitemap query core.
 *
 * Free of `next/cache` and of `@/payload.config` for the reason `./gallery`
 * gives: the Payload instance is passed in, so `@/lib/content/queries` can wrap
 * this in `unstable_cache` while tests — which have no Next server context, and
 * so no incremental cache for `unstable_cache` to reach — can call it directly.
 *
 * Only slugs and timestamps. What those become — the fixed routes around them,
 * the priorities, the absolute URLs — is `@/lib/seo/sitemap`'s problem.
 */
import type { Payload, PayloadRequest } from 'payload'

/** One routable document, reduced to what a sitemap needs of it. */
export type SitemapEntry = { slug: string; updatedAt: string }

export type SitemapContent = { albums: SitemapEntry[]; pages: SitemapEntry[] }

type Ctx = {
  payload: Payload
  req?: PayloadRequest
}

/** The later of two ISO timestamps, comparable as strings because both are UTC. */
const latest = (a: string, b: string | undefined): string => (b && b > a ? b : a)

/**
 * Album id -> `updatedAt` of the most recently touched artwork in it.
 *
 * `depth: 0` leaves `album` as a bare id, which is exactly the key wanted, and
 * saves the joins a populated relationship would cost.
 */
const findNewestArtworkPerAlbum = async ({
  albumIds,
  payload,
  req,
}: { albumIds: number[] } & Ctx): Promise<Map<number, string>> => {
  const newest = new Map<number, string>()

  if (albumIds.length === 0) {
    return newest
  }

  const { docs } = await payload.find({
    collection: 'artworks',
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    select: { album: true, updatedAt: true },
    where: {
      and: [
        { published: { equals: true } },
        { album: { in: albumIds } },
        { 'image.enabled': { equals: true } },
      ],
    },
  })

  for (const artwork of docs) {
    const albumId = typeof artwork.album === 'number' ? artwork.album : artwork.album?.id

    if (albumId === undefined) {
      continue
    }

    newest.set(albumId, latest(newest.get(albumId) ?? artwork.updatedAt, artwork.updatedAt))
  }

  return newest
}

/**
 * Every published album and copy page, as slug plus a last-modified timestamp.
 *
 * A query of its own rather than a reuse of `findGalleryAlbums`: that one
 * projects covers and counts through the media joins, none of which a sitemap
 * wants, and its `GalleryAlbumSummary` carries no `updatedAt`. Here `select`
 * keeps each read down to the two columns that are actually emitted.
 *
 * An album's own `updatedAt` only moves when the album document is edited, so
 * adding an artwork to one would otherwise leave its `lastmod` stale — hence the
 * third read, which folds the newest artwork in each album into that album's
 * timestamp. The filter matches `findGalleryArtworks` (published, and
 * `image.enabled`) so the timestamp tracks what the album page actually renders.
 *
 * Accuracy is the point: Google treats a sitemap whose `lastmod` values it finds
 * unreliable by ignoring `lastmod` for the whole site, which is worse than not
 * having sent one.
 */
export const findSitemapContent = async ({ payload, req }: Ctx): Promise<SitemapContent> => {
  const [albums, pages] = await Promise.all([
    payload.find({
      collection: 'albums',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      req,
      select: { slug: true, updatedAt: true },
      where: { published: { equals: true } },
    }),
    payload.find({
      collection: 'pages',
      depth: 0,
      overrideAccess: true,
      pagination: false,
      req,
      select: { slug: true, updatedAt: true },
      where: { published: { equals: true } },
    }),
  ])

  const newestArtwork = await findNewestArtworkPerAlbum({
    albumIds: albums.docs.map((album) => album.id),
    payload,
    req,
  })

  return {
    albums: albums.docs.map((album) => ({
      slug: album.slug,
      updatedAt: latest(album.updatedAt, newestArtwork.get(album.id)),
    })),
    pages: pages.docs.map((page) => ({ slug: page.slug, updatedAt: page.updatedAt })),
  }
}
