/**
 * Gallery query core.
 *
 * Deliberately free of `next/cache` and of `@/payload.config`: the Payload
 * instance is passed in, so `@/lib/content/queries` can wrap it in
 * `unstable_cache` for server components without this module reaching back
 * through the cached layer.
 *
 * The query itself is unpaginated: it returns every published artwork of every
 * album asked for, in one pass, and the chips filter that set client-side.
 * Reordering an album in the admin therefore changes the grid order without any
 * per-chip fetching. Callers that only want a preview cap the result with
 * `takePerAlbum` rather than paginating.
 */
import type { Payload, PayloadRequest } from 'payload'

import type { Album, Media } from '@/payload-types'

/**
 * Each artwork's position within its own album.
 *
 * Payload derives the name from the orderable join field on `Albums` as
 * `_<collection>_<field>_order`, so it is generated rather than declared —
 * renaming that field renames this column. It is per-album by construction:
 * dragging a row on one album cannot disturb another's order.
 */
export const ARTWORK_ORDER_FIELD = '_artworks_artworks_order'

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
    sort: ['_order', 'title'],
    where: {
      and: [{ published: { equals: true } }, { slug: { in: wanted } }],
    },
  })

  return docs
}

/**
 * The first `perAlbum` artworks of each album, discarding the rest.
 *
 * A filter rather than a group-and-slice, so the album ordering the query
 * already applied survives untouched. Albums holding fewer than `perAlbum`
 * artworks simply contribute all of them; the cap is a ceiling, not a quota, so
 * a thin album never pulls extras from a fat one.
 *
 * Capping here rather than in the query is deliberate: SQL cannot express "n
 * rows per group" without a window function, and the alternative — one query
 * per album — trades a single cached read for one per chip.
 */
export const takePerAlbum = (
  artworks: GalleryArtwork[],
  perAlbum: number,
): GalleryArtwork[] => {
  const taken = new Map<string, number>()

  return artworks.filter((artwork) => {
    const soFar = taken.get(artwork.album.slug) ?? 0

    if (soFar >= perAlbum) {
      return false
    }

    taken.set(artwork.album.slug, soFar + 1)

    return true
  })
}

export const findGalleryArtworks = async ({
  albumSlugs,
  payload,
  req,
}: { albumSlugs: string[] } & Ctx): Promise<GalleryPage> => {
  const albums = await findPublishedAlbumsBySlug({ payload, req, slugs: albumSlugs })

  // No selected chips means an empty grid, not the entire catalogue.
  if (albums.length === 0) {
    return { albums: [], artworks: [], totalDocs: 0 }
  }

  const result = await payload.find({
    collection: 'artworks',
    depth: 1,
    // `pagination: false` returns every match in one pass; the gallery is
    // filtered client-side, so a partial page would silently hide work.
    overrideAccess: true,
    pagination: false,
    req,
    // Album order first, so the union of several selected chips still reads as
    // grouped albums rather than an interleaved jumble. The dotted path makes
    // the adapter join `albums`; an unresolvable sort path is silently dropped
    // by the query builder rather than raising, hence the integration test that
    // asserts the resulting order.
    sort: ['album._order', ARTWORK_ORDER_FIELD, 'title'],
    where: {
      and: [
        { published: { equals: true } },
        { album: { in: albums.map((album) => album.id) } },
        // Filtered in the query rather than dropped from `result.docs`, so
        // `totalDocs` stays honest and matches the number of cards that render.
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
    totalDocs: result.totalDocs,
  }
}
