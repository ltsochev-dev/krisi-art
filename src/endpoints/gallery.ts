import type { Endpoint } from 'payload'

import { headersWithCors } from 'payload'

import {
  DEFAULT_GALLERY_LIMIT,
  MAX_GALLERY_LIMIT,
  findGalleryArtworks,
} from '@/lib/content/gallery'

const parsePositiveInt = (value: null | string): number | undefined => {
  if (value === null || value.trim() === '') {
    return undefined
  }

  const parsed = Number(value)

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return NaN
  }

  return parsed
}

/**
 * `GET /api/artworks/gallery?albums=portraits,murals&limit=12&page=1`
 *
 * Backs the homepage's album filter chips. Mounted on the `artworks` collection
 * rather than as a Next route handler because `src/app/(payload)/api/[...slug]`
 * already owns the `/api/*` namespace.
 *
 * Always public and always published-only: it takes no user into account, which
 * is what makes the response safe to cache at the edge.
 */
export const galleryEndpoint: Endpoint = {
  path: '/gallery',
  method: 'get',
  handler: async (req) => {
    const params = new URL(req.url ?? '', 'http://localhost').searchParams

    const limit = parsePositiveInt(params.get('limit'))
    const page = parsePositiveInt(params.get('page'))

    if (Number.isNaN(limit) || Number.isNaN(page)) {
      return Response.json(
        { error: '`limit` and `page` must be positive integers.' },
        { headers: headersWithCors({ headers: new Headers(), req }), status: 400 },
      )
    }

    if (limit !== undefined && limit > MAX_GALLERY_LIMIT) {
      return Response.json(
        { error: `\`limit\` may not exceed ${MAX_GALLERY_LIMIT}.` },
        { headers: headersWithCors({ headers: new Headers(), req }), status: 400 },
      )
    }

    // Unknown or unpublished slugs are dropped by the query rather than
    // rejected — a chip for a just-unpublished album should return nothing, not
    // break the whole request.
    const albumSlugs = (params.get('albums') ?? '')
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean)

    const result = await findGalleryArtworks({
      albumSlugs,
      limit: limit ?? DEFAULT_GALLERY_LIMIT,
      page,
      payload: req.payload,
      req,
    })

    return Response.json(result, {
      headers: headersWithCors({
        headers: new Headers({
          // Short shared cache: an edit invalidates the server-component cache
          // through tags, but this response is fetched by the browser and cannot
          // be tag-invalidated, so keep the window small.
          'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
        }),
        req,
      }),
    })
  },
}
