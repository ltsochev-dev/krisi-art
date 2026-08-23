/**
 * @vitest-environment node
 *
 * Payload, sharp and the upload pipeline are server-only; the project's default
 * jsdom environment breaks them.
 *
 * These run against the configured DATABASE_URL, so every document created here
 * is namespaced with `PREFIX` and removed in `afterAll`.
 */
import type { Album, Media } from '@/payload-types'

import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seedMedia } from '../helpers/seedMedia'
import config from '@/payload.config'
import { findGalleryArtworks, findPublishedAlbumsBySlug, toGalleryImage } from '@/lib/content/gallery'
import { DEFAULT_ALBUM_SLUG, findDefaultAlbum } from '@/lib/content/default-album'
import { validateContactInput } from '@/lib/validation/contact'
import { CONTACT_LIMITS } from '@/lib/validation/contact'

const PREFIX = 'zz-int-test'

let payload: Payload
let media: Media
/** Seeded without `enabled`, so it carries the collection's `false` default. */
let notReadyMedia: Media
/** Album ordering: `first` sorts ahead of `second`. */
let first: Album
let second: Album

describe('portfolio content', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    media = await seedMedia({ enabled: true, name: `${PREFIX}-image`, payload })
    notReadyMedia = await seedMedia({ name: `${PREFIX}-not-ready`, payload })

    first = await payload.create({
      collection: 'albums',
      data: { published: true, slug: `${PREFIX}-first`, sortOrder: 1, title: `${PREFIX} First` },
      overrideAccess: true,
    })

    second = await payload.create({
      collection: 'albums',
      data: { published: true, slug: `${PREFIX}-second`, sortOrder: 2, title: `${PREFIX} Second` },
      overrideAccess: true,
    })
  })

  afterAll(async () => {
    // Artworks first — deleting an album reassigns them to Uncategorized, which
    // would leave strays behind.
    await payload.delete({
      collection: 'artworks',
      overrideAccess: true,
      where: { title: { like: PREFIX } },
    })

    await payload.delete({
      collection: 'albums',
      overrideAccess: true,
      where: { slug: { like: PREFIX } },
    })

    await payload.delete({
      collection: 'contact-submissions',
      overrideAccess: true,
      where: { name: { like: PREFIX } },
    })

    await payload.delete({ collection: 'media', id: media.id, overrideAccess: true })
    await payload.delete({ collection: 'media', id: notReadyMedia.id, overrideAccess: true })
  })

  describe('the media readiness gate', () => {
    it('leaves a new upload disabled until someone enables it', () => {
      // `seedMedia` sent no `enabled`, so this is the collection default.
      expect(notReadyMedia.enabled).toBeFalsy()
    })

    it('projects a disabled image as absent rather than broken', () => {
      expect(toGalleryImage(notReadyMedia)).toBeNull()
      expect(toGalleryImage(media)).not.toBeNull()
    })
  })

  describe('media derivatives', () => {
    it('generates every declared image size for a large upload', () => {
      expect(media.sizes?.thumbnail?.url).toBeTruthy()
      expect(media.sizes?.card?.width).toBe(768)
      expect(media.sizes?.tablet?.width).toBe(1024)
      // The source is 1600px wide, so `hero` (1920) falls back to the original
      // rather than being upscaled.
      expect(media.sizes?.hero?.width).toBeLessThanOrEqual(1920)
    })

    it('converts the grid sizes to webp', () => {
      expect(media.sizes?.thumbnail?.mimeType).toBe('image/webp')
      expect(media.sizes?.card?.mimeType).toBe('image/webp')
    })

    it('does not enlarge an image smaller than a declared size', async () => {
      const tiny = await seedMedia({ height: 120, name: `${PREFIX}-tiny`, payload, width: 160 })

      try {
        // `withoutEnlargement: true` returns the original instead of upscaling.
        expect(tiny.sizes?.card?.width ?? tiny.width).toBeLessThanOrEqual(160)
        expect(tiny.sizes?.hero?.width ?? tiny.width).toBeLessThanOrEqual(160)
      } finally {
        await payload.delete({ collection: 'media', id: tiny.id, overrideAccess: true })
      }
    })
  })

  describe('the default album', () => {
    it('exists after init and is flagged', async () => {
      const album = await findDefaultAlbum({ payload })

      expect(album).toBeDefined()
      expect(album?.slug).toBe(DEFAULT_ALBUM_SLUG)
      expect(album?.isDefault).toBe(true)
    })

    it('cannot be deleted', async () => {
      const album = await findDefaultAlbum({ payload })

      await expect(
        payload.delete({ collection: 'albums', id: album!.id, overrideAccess: true }),
      ).rejects.toThrow(/cannot be deleted/i)
    })

    it('cannot have its slug changed', async () => {
      const album = await findDefaultAlbum({ payload })

      await expect(
        payload.update({
          collection: 'albums',
          data: { slug: 'renamed' },
          id: album!.id,
          overrideAccess: true,
        }),
      ).rejects.toThrow(/fixed at/i)
    })

    it('catches an artwork created without an album', async () => {
      const artwork = await payload.create({
        collection: 'artworks',
        // `album` is required, so omitting it is a type error by design — the
        // cast is the point of the test: the hook has to fill it in.
        data: { image: media.id, sortOrder: 0, title: `${PREFIX} no album` } as never,
        depth: 0,
        overrideAccess: true,
      })

      const fallback = await findDefaultAlbum({ payload })

      expect(artwork.album).toBe(fallback!.id)
    })

    it('catches an artwork whose album is explicitly cleared', async () => {
      const artwork = await payload.create({
        collection: 'artworks',
        data: {
          album: null as unknown as number,
          image: media.id,
          sortOrder: 0,
          title: `${PREFIX} null album`,
        },
        depth: 0,
        overrideAccess: true,
      })

      const fallback = await findDefaultAlbum({ payload })

      expect(artwork.album).toBe(fallback!.id)
    })

    it('adopts the artworks of a deleted album', async () => {
      const doomed = await payload.create({
        collection: 'albums',
        data: { slug: `${PREFIX}-doomed`, sortOrder: 5, title: `${PREFIX} Doomed` },
        overrideAccess: true,
      })

      const artwork = await payload.create({
        collection: 'artworks',
        data: { album: doomed.id, image: media.id, sortOrder: 0, title: `${PREFIX} orphan` },
        depth: 0,
        overrideAccess: true,
      })

      await payload.delete({ collection: 'albums', id: doomed.id, overrideAccess: true })

      const reloaded = await payload.findByID({
        collection: 'artworks',
        depth: 0,
        id: artwork.id,
        overrideAccess: true,
      })
      const fallback = await findDefaultAlbum({ payload })

      expect(reloaded.album).toBe(fallback!.id)
    })
  })

  describe('the gallery query', () => {
    beforeAll(async () => {
      // Deliberately created out of order, so a passing assertion proves the
      // sort rather than the insertion order.
      const rows = [
        { album: second.id, sortOrder: 1, title: `${PREFIX} B1` },
        { album: first.id, sortOrder: 2, title: `${PREFIX} A2` },
        { album: second.id, sortOrder: 0, title: `${PREFIX} B0` },
        { album: first.id, sortOrder: 0, title: `${PREFIX} A0` },
      ]

      for (const row of rows) {
        await payload.create({
          collection: 'artworks',
          data: { ...row, image: media.id, published: true },
          overrideAccess: true,
        })
      }

      await payload.create({
        collection: 'artworks',
        data: {
          album: first.id,
          image: media.id,
          published: false,
          sortOrder: 1,
          title: `${PREFIX} A-hidden`,
        },
        overrideAccess: true,
      })

      // Published artwork, unfinished image. The artwork itself is fine; the
      // gallery must still skip it until the image is switched on.
      await payload.create({
        collection: 'artworks',
        data: {
          album: first.id,
          image: notReadyMedia.id,
          published: true,
          sortOrder: 3,
          title: `${PREFIX} A-not-ready`,
        },
        overrideAccess: true,
      })
    })

    it('orders by album sortOrder, then artwork sortOrder', async () => {
      const result = await findGalleryArtworks({
        albumSlugs: [second.slug, first.slug],
        limit: 20,
        payload,
      })

      expect(result.artworks.map((artwork) => artwork.title)).toEqual([
        `${PREFIX} A0`,
        `${PREFIX} A2`,
        `${PREFIX} B0`,
        `${PREFIX} B1`,
      ])
    })

    it('excludes unpublished artworks', async () => {
      const result = await findGalleryArtworks({
        albumSlugs: [first.slug],
        limit: 20,
        payload,
      })

      expect(result.artworks.map((artwork) => artwork.title)).not.toContain(`${PREFIX} A-hidden`)
    })

    it('returns an empty page rather than everything when nothing is selected', async () => {
      const result = await findGalleryArtworks({ albumSlugs: [], payload })

      expect(result.artworks).toHaveLength(0)
      expect(result.totalDocs).toBe(0)
      expect(result.albums).toEqual([])
    })

    it('ignores unknown and unpublished album slugs', async () => {
      const hidden = await payload.create({
        collection: 'albums',
        data: {
          published: false,
          slug: `${PREFIX}-hidden`,
          sortOrder: 3,
          title: `${PREFIX} Hidden`,
        },
        overrideAccess: true,
      })

      const albums = await findPublishedAlbumsBySlug({
        payload,
        slugs: [first.slug, hidden.slug, 'does-not-exist'],
      })

      expect(albums.map((album) => album.slug)).toEqual([first.slug])
    })

    it('caps the page size', async () => {
      const result = await findGalleryArtworks({
        albumSlugs: [first.slug],
        limit: 5_000,
        payload,
      })

      expect(result.limit).toBe(48)
    })

    it('excludes artworks whose image is not enabled yet', async () => {
      const result = await findGalleryArtworks({
        albumSlugs: [first.slug],
        limit: 20,
        payload,
      })

      expect(result.artworks.map((artwork) => artwork.title)).not.toContain(
        `${PREFIX} A-not-ready`,
      )
      // Filtered in the query, not after it, so the count matches the rows.
      expect(result.totalDocs).toBe(result.artworks.length)
    })

    it('projects the image sizes the frontend needs', async () => {
      const result = await findGalleryArtworks({
        albumSlugs: [first.slug],
        limit: 1,
        payload,
      })

      expect(result.artworks[0]?.image?.sizes.card).toBeTruthy()
      expect(result.artworks[0]?.image?.alt).toBe(media.alt)
    })
  })

  describe('public read access', () => {
    it('hides unpublished artworks from an unauthenticated caller', async () => {
      const result = await payload.find({
        collection: 'artworks',
        depth: 0,
        // No user + no override: exactly what a public REST request gets.
        overrideAccess: false,
        pagination: false,
        where: { title: { like: PREFIX } },
      })

      expect(result.docs.every((doc) => doc.published)).toBe(true)
    })

    it('hides unpublished albums from an unauthenticated caller', async () => {
      const result = await payload.find({
        collection: 'albums',
        depth: 0,
        overrideAccess: false,
        pagination: false,
        where: { slug: { like: PREFIX } },
      })

      expect(result.docs.every((doc) => doc.published)).toBe(true)
    })

    it('refuses to expose contact submissions', async () => {
      await payload.create({
        collection: 'contact-submissions',
        data: {
          email: 'someone@example.com',
          message: 'A stored message that the public must never read.',
          name: `${PREFIX} sender`,
          status: 'new',
        },
        overrideAccess: true,
      })

      await expect(
        payload.find({ collection: 'contact-submissions', overrideAccess: false }),
      ).rejects.toThrow()
    })
  })
})

describe('contact form validation', () => {
  const valid = {
    email: 'visitor@example.com',
    message: 'I would like to commission a piece, please get in touch.',
    name: 'Visitor',
    subject: 'Commission',
  }

  it('accepts a well-formed submission', () => {
    const result = validateContactInput(valid)

    expect(result.ok).toBe(true)
  })

  it('trims whitespace off the stored values', () => {
    const result = validateContactInput({ ...valid, name: '  Visitor  ' })

    expect(result.ok && result.value.name).toBe('Visitor')
  })

  it('rejects a malformed email', () => {
    const result = validateContactInput({ ...valid, email: 'not-an-email' })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.errors.email).toBeTruthy()
  })

  it('rejects a missing name and message together', () => {
    const result = validateContactInput({ ...valid, message: '', name: '' })

    expect(result.ok === false && result.errors.name).toBeTruthy()
    expect(result.ok === false && result.errors.message).toBeTruthy()
  })

  it('rejects an over-long message', () => {
    const result = validateContactInput({
      ...valid,
      message: 'x'.repeat(CONTACT_LIMITS.message + 1),
    })

    expect(result.ok === false && result.errors.message).toBeTruthy()
  })

  it('rejects a filled honeypot without saying why', () => {
    const result = validateContactInput({ ...valid, honeypot: 'http://spam.example' })

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.formError).toBe('REJECTED_HONEYPOT')
    expect(result.ok === false && Object.keys(result.errors)).toHaveLength(0)
  })
})
