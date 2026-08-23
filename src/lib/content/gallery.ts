/**
 * Gallery query core.
 *
 * Deliberately free of `next/cache` and of `@/payload.config`: the Payload
 * instance is passed in. That lets both callers reuse the exact same query —
 *
 * - `@/lib/content/queries` wraps it in `unstable_cache` for server components,
 * - the `/api/artworks/gallery` endpoint calls it with `req.payload`,
 *
 * — without the endpoint (which lives inside the config) importing the config
 * back through the cached layer.
 */
import type { Payload, PayloadRequest } from 'payload'

import type { Album, Media } from '@/payload-types'

/** Hard ceiling on how many artworks one gallery request may return. */
export const MAX_GALLERY_LIMIT = 48
export const DEFAULT_GALLERY_LIMIT = 12

/** The lean image shape the frontend renders. Mirrors the sizes in `Media.ts`. */
export type GalleryImage = {
  alt: string
  caption: null | string
  height: null | number
  id: number
  sizes: {
    card: null | string
    hero: null | string
    tablet: null | string
    thumbnail: null | string
  }
  url: null | string
  width: null | number
}

export type GalleryArtwork = {
  album: { id: number; slug: string; title: string }
  description: null | string
  dimensions: null | string
  id: number
  image: GalleryImage | null
  medium: null | string
  tags: string[]
  title: string
  year: null | number
}

export type GalleryPage = {
  /** Echo of the album slugs that were actually resolved and queried. */
  albums: string[]
  artworks: GalleryArtwork[]
  hasNextPage: boolean
  limit: number
  page: number
  totalDocs: number
}

type Ctx = {
  payload: Payload
  req?: PayloadRequest
}

export const isPopulated = <T extends { id: number }>(
  value: null | number | T | undefined,
): value is T => typeof value === 'object' && value !== null

/**
 * Projects a populated media doc into the shape the frontend renders.
 *
 * A disabled image is treated exactly like a missing one, so every caller that
 * already handles `null` — the hero, the about grid, the gallery — hides it for
 * free. This is the single chokepoint for `media.enabled`: nothing renders an
 * image without going through here.
 */
export const toGalleryImage = (media: Media | null | number | undefined): GalleryImage | null => {
  if (!isPopulated(media) || !media.enabled) {
    return null
  }

  return {
    alt: media.alt,
    caption: media.caption ?? null,
    height: media.height ?? null,
    id: media.id,
    sizes: {
      card: media.sizes?.card?.url ?? null,
      hero: media.sizes?.hero?.url ?? null,
      tablet: media.sizes?.tablet?.url ?? null,
      thumbnail: media.sizes?.thumbnail?.url ?? null,
    },
    url: media.url ?? null,
    width: media.width ?? null,
  }
}

export const clampLimit = (limit: number | undefined): number =>
  Math.min(Math.max(Math.trunc(limit ?? DEFAULT_GALLERY_LIMIT) || 1, 1), MAX_GALLERY_LIMIT)

/**
 * Published albums matching the given slugs, in chip order.
 *
 * Doubles as slug validation for the endpoint: an unknown or unpublished slug
 * simply does not come back, so it can never widen the result set.
 */
export const findPublishedAlbumsBySlug = async ({
  payload,
  req,
  slugs,
}: { slugs: string[] } & Ctx): Promise<Album[]> => {
  const wanted = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))]

  if (wanted.length === 0) {
    return []
  }

  const { docs } = await payload.find({
    collection: 'albums',
    depth: 0,
    overrideAccess: true,
    pagination: false,
    req,
    sort: ['sortOrder', 'title'],
    where: {
      and: [{ published: { equals: true } }, { slug: { in: wanted } }],
    },
  })

  return docs
}

export const findGalleryArtworks = async ({
  albumSlugs,
  limit,
  page = 1,
  payload,
  req,
}: {
  albumSlugs: string[]
  limit?: number
  page?: number
} & Ctx): Promise<GalleryPage> => {
  const cappedLimit = clampLimit(limit)
  const requestedPage = Math.max(Math.trunc(page) || 1, 1)

  const albums = await findPublishedAlbumsBySlug({ payload, req, slugs: albumSlugs })

  // No selected chips means an empty grid, not the entire catalogue.
  if (albums.length === 0) {
    return {
      albums: [],
      artworks: [],
      hasNextPage: false,
      limit: cappedLimit,
      page: requestedPage,
      totalDocs: 0,
    }
  }

  const result = await payload.find({
    collection: 'artworks',
    depth: 1,
    limit: cappedLimit,
    overrideAccess: true,
    page: requestedPage,
    req,
    // Album order first, so the union of several selected chips still reads as
    // grouped albums rather than an interleaved jumble. The dotted path makes
    // the adapter join `albums`; an unresolvable sort path is silently dropped
    // by the query builder rather than raising, hence the integration test that
    // asserts the resulting order.
    sort: ['album.sortOrder', 'sortOrder', 'title'],
    where: {
      and: [
        { published: { equals: true } },
        { album: { in: albums.map((album) => album.id) } },
        // Filtered in the query rather than dropped from `result.docs`, so
        // `totalDocs` and `hasNextPage` stay honest — post-filtering would leave
        // short pages and a page count that promises artworks it cannot deliver.
        { 'image.enabled': { equals: true } },
      ],
    },
  })

  const albumsById = new Map(albums.map((album) => [album.id, album]))

  return {
    albums: albums.map((album) => album.slug),
    artworks: result.docs.flatMap((doc) => {
      const album = isPopulated<Album>(doc.album) ? doc.album : albumsById.get(doc.album)

      if (!album) {
        return []
      }

      return [
        {
          album: { id: album.id, slug: album.slug, title: album.title },
          description: doc.description ?? null,
          dimensions: doc.dimensions ?? null,
          id: doc.id,
          image: toGalleryImage(doc.image),
          medium: doc.medium ?? null,
          tags: (doc.tags ?? []).flatMap((tag) => (isPopulated(tag) ? [tag.name] : [])),
          title: doc.title,
          year: doc.year ?? null,
        },
      ]
    }),
    hasNextPage: Boolean(result.hasNextPage),
    limit: cappedLimit,
    page: result.page ?? requestedPage,
    totalDocs: result.totalDocs,
  }
}
