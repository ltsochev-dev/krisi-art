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
import {
  findGalleryAlbums,
  findGalleryArtworks,
  findPublishedAlbumsBySlug,
  takePerAlbum,
  toGalleryImage,
} from '@/lib/content/gallery'
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

    // `albums.orderable` assigns `_order` on create, so creating `first` before
    // `second` is what puts it earlier in the chip order.
    first = await payload.create({
      collection: 'albums',
      data: { published: true, slug: `${PREFIX}-first`, title: `${PREFIX} First` },
      overrideAccess: true,
    })

    second = await payload.create({
      collection: 'albums',
      data: { published: true, slug: `${PREFIX}-second`, title: `${PREFIX} Second` },
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
        data: { image: media.id, title: `${PREFIX} no album` } as never,
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
        data: { slug: `${PREFIX}-doomed`, title: `${PREFIX} Doomed` },
        overrideAccess: true,
      })

      const artwork = await payload.create({
        collection: 'artworks',
        data: { album: doomed.id, image: media.id, title: `${PREFIX} orphan` },
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
      // `_order` follows insertion order, so the albums are deliberately
      // interleaved here: sorting has to regroup them by album for the
      // assertion below to pass, which insertion order alone would not do.
      const rows = [
        { album: first.id, title: `${PREFIX} A0` },
        { album: second.id, title: `${PREFIX} B0` },
        { album: first.id, title: `${PREFIX} A2` },
        { album: second.id, title: `${PREFIX} B1` },
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
          title: `${PREFIX} A-not-ready`,
        },
        overrideAccess: true,
      })
    })

    it('groups by album order, then artwork order', async () => {
      // Slugs passed in reverse, so album order cannot be an echo of the input.
      const result = await findGalleryArtworks({
        albumSlugs: [second.slug, first.slug],
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
      const result = await findGalleryArtworks({ albumSlugs: [first.slug], payload })

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
        data: { published: false, slug: `${PREFIX}-hidden`, title: `${PREFIX} Hidden` },
        overrideAccess: true,
      })

      const albums = await findPublishedAlbumsBySlug({
        payload,
        slugs: [first.slug, hidden.slug, 'does-not-exist'],
      })

      expect(albums.map((album) => album.slug)).toEqual([first.slug])
    })

    it('excludes artworks whose image is not enabled yet', async () => {
      const result = await findGalleryArtworks({ albumSlugs: [first.slug], payload })

      expect(result.artworks.map((artwork) => artwork.title)).not.toContain(
        `${PREFIX} A-not-ready`,
      )
      // Filtered in the query, not after it, so the count matches the rows.
      expect(result.totalDocs).toBe(result.artworks.length)
    })

    it('projects the image sizes the frontend needs', async () => {
      const result = await findGalleryArtworks({ albumSlugs: [first.slug], payload })

      expect(result.artworks[0]?.image?.sizes.card).toBeTruthy()
      expect(result.artworks[0]?.image?.alt).toBe(media.alt)
    })

    describe('the gallery index', () => {
      it('gives each album a cover and a count', async () => {
        const albums = await findGalleryAlbums({ payload })
        const mine = albums.filter((album) => album.slug.startsWith(PREFIX))

        expect(mine.map((album) => album.slug)).toEqual([first.slug, second.slug])
        // `first` holds A0 and A2 — A-hidden is unpublished and A-not-ready has a
        // disabled image, so neither counts nor becomes the cover.
        expect(mine[0]?.artworkCount).toBe(2)
        expect(mine[0]?.cover?.sizes.card).toBeTruthy()
      })

      it('keeps an album with nothing renderable, rather than dropping it', async () => {
        const empty = await payload.create({
          collection: 'albums',
          data: { published: true, slug: `${PREFIX}-bare`, title: `${PREFIX} Bare` },
          overrideAccess: true,
        })

        const albums = await findGalleryAlbums({ payload })
        const bare = albums.find((album) => album.slug === empty.slug)

        expect(bare).toBeDefined()
        expect(bare?.artworkCount).toBe(0)
        expect(bare?.cover).toBeNull()
      })

      it('leaves unpublished albums out entirely', async () => {
        const albums = await findGalleryAlbums({ payload })

        expect(albums.map((album) => album.slug)).not.toContain(DEFAULT_ALBUM_SLUG)
      })
    })

    describe('the homepage per-album cap', () => {
      it('keeps the first n of each album and drops the rest', async () => {
        const result = await findGalleryArtworks({
          albumSlugs: [second.slug, first.slug],
          payload,
        })

        // `first` holds A0 and A2, `second` holds B0 and B1.
        const capped = takePerAlbum(result.artworks, 1)

        expect(capped.map((artwork) => artwork.title)).toEqual([
          `${PREFIX} A0`,
          `${PREFIX} B0`,
        ])
      })

      it('is a ceiling, not a quota — a thin album never pulls extras', async () => {
        const artworks = await findGalleryArtworks({
          albumSlugs: [second.slug, first.slug],
          payload,
        }).then((result) => result.artworks)

        // Every album here has fewer than 10, so nothing is dropped.
        expect(takePerAlbum(artworks, 10)).toHaveLength(artworks.length)
      })

      it('leaves the query ordering untouched', async () => {
        const artworks = await findGalleryArtworks({
          albumSlugs: [second.slug, first.slug],
          payload,
        }).then((result) => result.artworks)

        expect(takePerAlbum(artworks, 5).map((a) => a.title)).toEqual(
          artworks.map((a) => a.title),
        )
      })
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
