/**
 * The "Uncategorized" album.
 *
 * Every artwork must belong to an album, so there has to be one album that
 * always exists and can never be deleted. It is identified by the `isDefault`
 * flag rather than by its slug or title, so an editor renaming it does not
 * silently orphan the fallback.
 *
 * Created by `onInit` in `payload.config.ts`, and lazily by the helpers below so
 * tests and seed scripts do not have to care about ordering.
 */
import type { Payload, PayloadRequest } from 'payload'

import type { Album } from '@/payload-types'

export const DEFAULT_ALBUM_SLUG = 'uncategorized'
export const DEFAULT_ALBUM_TITLE = 'Uncategorized'

type Ctx = {
  payload: Payload
  /** Pass through from a hook so the read joins that hook's transaction. */
  req?: PayloadRequest
}

export const findDefaultAlbum = async ({ payload, req }: Ctx): Promise<Album | undefined> => {
  const { docs } = await payload.find({
    collection: 'albums',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    where: { isDefault: { equals: true } },
  })

  return docs[0]
}

/**
 * Returns the default album, creating it if this is a fresh database.
 *
 * The slug is unique, so if two callers race the loser's create throws and we
 * simply re-read instead of ending up with two default albums.
 */
export const ensureDefaultAlbum = async ({ payload, req }: Ctx): Promise<Album> => {
  const existing = await findDefaultAlbum({ payload, req })

  if (existing) {
    return existing
  }

  try {
    return await payload.create({
      collection: 'albums',
      // The album carries no editorial content, so there is nothing to
      // revalidate and nothing to gain from busting caches during init.
      context: { disableRevalidate: true },
      data: {
        description: 'Artworks that have not been filed into an album yet.',
        isDefault: true,
        // Unpublished on purpose: this is a staging bucket, not a gallery. An
        // editor can publish it if they really want it on the site.
        published: false,
        slug: DEFAULT_ALBUM_SLUG,
        sortOrder: 9999,
        title: DEFAULT_ALBUM_TITLE,
      },
      depth: 0,
      overrideAccess: true,
      req,
    })
  } catch (error) {
    const raced = await findDefaultAlbum({ payload, req })

    if (raced) {
      return raced
    }

    throw error
  }
}

export const getDefaultAlbumId = async (ctx: Ctx): Promise<Album['id']> =>
  (await ensureDefaultAlbum(ctx)).id
