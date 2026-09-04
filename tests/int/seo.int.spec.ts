/**
 * Metadata assembly.
 *
 * Pure functions over a `SiteSetting` and a projected image, so unlike the other
 * int specs this one boots no Payload instance and touches no database — the
 * fixtures below are the shapes the cached read helpers hand back.
 *
 * `getSiteUrl` reads `APP_URL` on every call rather than caching it, which is
 * what lets these tests move the origin around.
 */
import type { Metadata } from 'next'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Media, SiteSetting } from '@/payload-types'

import { toGalleryImage } from '@/lib/content/gallery'
import { pageMetadata, siteMetadata } from '@/lib/seo/metadata'

const ORIGIN = 'https://kristina.example'

const { APP_URL: ORIGINAL_APP_URL, NEXT_PUBLIC_SERVER_URL: ORIGINAL_SERVER_URL } = process.env

type Card = {
  description?: string
  images?: { alt?: string; height?: number; url: string; width?: number }[]
  siteName?: string
  title?: string
  url?: string
}

/** The `openGraph`/`twitter` unions carry variants none of this uses. */
const og = (meta: Metadata): Card => meta.openGraph as Card
const twitter = (meta: Metadata): Card & { card?: string } =>
  meta.twitter as Card & { card?: string }

const settings = (overrides: Partial<SiteSetting> = {}): SiteSetting => ({
  id: 1,
  siteName: 'Kristina Kostova',
  ...overrides,
})

const media = (overrides: Partial<Media> = {}): Media => ({
  alt: 'Oil on canvas',
  createdAt: '2026-01-01T00:00:00.000Z',
  enabled: true,
  id: 7,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('seo metadata', () => {
  beforeEach(() => {
    process.env.APP_URL = ORIGIN
    delete process.env.NEXT_PUBLIC_SERVER_URL
  })

  afterAll(() => {
    // Restored rather than deleted: the rest of the suite runs in the same
    // process and `.env` is loaded once, in `vitest.setup.ts`.
    if (ORIGINAL_APP_URL === undefined) {
      delete process.env.APP_URL
    } else {
      process.env.APP_URL = ORIGINAL_APP_URL
    }

    if (ORIGINAL_SERVER_URL !== undefined) {
      process.env.NEXT_PUBLIC_SERVER_URL = ORIGINAL_SERVER_URL
    }
  })

  describe('titles', () => {
    it("suffixes a page's own title with the site name", () => {
      const meta = pageMetadata({
        path: '/gallery/portraits',
        settings: settings(),
        title: 'Portraits',
      })

      // A bare string, so the layout's `%s — <site name>` template applies to it.
      expect(meta.title).toBe('Portraits')
      expect(og(meta).title).toBe('Portraits — Kristina Kostova')
      expect(twitter(meta).title).toBe('Portraits — Kristina Kostova')
    })

    it('leaves an absolute title whole', () => {
      const meta = pageMetadata({
        absoluteTitle: true,
        path: '/',
        settings: settings(),
        title: 'Kristina Kostova — Artist',
      })

      expect(meta.title).toEqual({ absolute: 'Kristina Kostova — Artist' })
      expect(og(meta).title).toBe('Kristina Kostova — Artist')
    })

    it('does not append the site name to the site name', () => {
      const meta = pageMetadata({ path: '/gallery', settings: settings(), title: '   ' })

      expect(meta.title).toEqual({ absolute: 'Kristina Kostova' })
      expect(og(meta).title).toBe('Kristina Kostova')
    })

    it('prefers the default SEO title over the site name', () => {
      const meta = pageMetadata({
        path: '/gallery',
        settings: settings({ seo: { metaTitle: 'Kristina Kostova · Portfolio' } }),
      })

      expect(meta.title).toEqual({ absolute: 'Kristina Kostova · Portfolio' })
    })
  })

  describe('descriptions', () => {
    it('falls through the page field, the site default, then the tagline', () => {
      const withDefault = settings({
        seo: { metaDescription: 'Paintings and comics.' },
        tagline: 'Painter',
      })

      expect(
        pageMetadata({ description: 'This album.', path: '/a', settings: withDefault }).description,
      ).toBe('This album.')
      expect(pageMetadata({ path: '/a', settings: withDefault }).description).toBe(
        'Paintings and comics.',
      )
      expect(
        pageMetadata({ path: '/a', settings: settings({ tagline: 'Painter' }) }).description,
      ).toBe('Painter')
      expect(pageMetadata({ path: '/a', settings: settings() }).description).toBeUndefined()
    })

    it('collapses a textarea into one line', () => {
      const meta = pageMetadata({
        description: '  First paragraph.\n\n  Second\tparagraph.  ',
        path: '/contact',
        settings: settings(),
      })

      expect(meta.description).toBe('First paragraph. Second paragraph.')
      expect(og(meta).description).toBe('First paragraph. Second paragraph.')
    })

    it('clamps a long one on a word boundary', () => {
      const meta = pageMetadata({
        description: `${'word '.repeat(80)}end`,
        path: '/contact',
        settings: settings(),
      })

      const description = meta.description as string

      expect(description.endsWith('…')).toBe(true)
      expect(description.length).toBeLessThanOrEqual(201)
      // Cut between words, never mid-word and never on trailing whitespace.
      expect(description).toMatch(/word…$/)
    })

    it('leaves a description that already fits alone', () => {
      const short = 'A short line.'

      expect(
        pageMetadata({ description: short, path: '/a', settings: settings() }).description,
      ).toBe(short)
    })
  })

  describe('card images', () => {
    it('prefers the hero rendition and resolves it against the origin', () => {
      const meta = pageMetadata({
        image: toGalleryImage(
          media({
            height: 2000,
            sizes: {
              card: { url: '/api/media/file/piece-card.webp' },
              hero: { url: '/api/media/file/piece-hero.jpg' },
            },
            url: '/api/media/file/piece.jpg',
            width: 1600,
          }),
        ),
        path: '/gallery/portraits',
        settings: settings(),
        title: 'Portraits',
      })

      expect(og(meta).images).toEqual([
        { alt: 'Oil on canvas', url: `${ORIGIN}/api/media/file/piece-hero.jpg` },
      ])
      expect(twitter(meta).card).toBe('summary_large_image')
    })

    it('reports dimensions only for the original', () => {
      const meta = pageMetadata({
        image: toGalleryImage(
          media({ height: 900, url: '/api/media/file/piece.jpg', width: 1200 }),
        ),
        path: '/a',
        settings: settings(),
      })

      expect(og(meta).images).toEqual([
        {
          alt: 'Oil on canvas',
          height: 900,
          url: `${ORIGIN}/api/media/file/piece.jpg`,
          width: 1200,
        },
      ])
    })

    it('omits the alt when the upload has none', () => {
      const meta = pageMetadata({
        image: toGalleryImage(media({ alt: null, url: '/api/media/file/piece.jpg' })),
        path: '/a',
        settings: settings(),
      })

      expect(og(meta).images).toEqual([{ url: `${ORIGIN}/api/media/file/piece.jpg` }])
    })

    it('keeps a CDN URL absolute, with no origin configured', () => {
      delete process.env.APP_URL

      const meta = pageMetadata({
        image: toGalleryImage(
          media({ sizes: { hero: { url: 'https://cdn.example/piece-hero.jpg' } } }),
        ),
        path: '/a',
        settings: settings(),
      })

      expect(og(meta).images).toEqual([
        { alt: 'Oil on canvas', url: 'https://cdn.example/piece-hero.jpg' },
      ])
    })

    it('drops a relative image rather than publishing one a crawler cannot fetch', () => {
      delete process.env.APP_URL

      const meta = pageMetadata({
        image: toGalleryImage(media({ url: '/api/media/file/piece.jpg' })),
        path: '/a',
        settings: settings(),
      })

      expect(og(meta).images).toBeUndefined()
      expect(twitter(meta).card).toBe('summary')
    })

    it('never publishes an upload that is not marked ready', () => {
      const meta = pageMetadata({
        image: toGalleryImage(media({ enabled: false, url: '/api/media/file/draft.jpg' })),
        path: '/a',
        settings: settings(),
      })

      expect(og(meta).images).toBeUndefined()
    })

    it('falls back to the site default image', () => {
      const meta = pageMetadata({
        path: '/contact',
        settings: settings({
          seo: { ogImage: media({ sizes: { hero: { url: '/api/media/file/default-hero.jpg' } } }) },
        }),
        title: 'Contact',
      })

      expect(og(meta).images).toEqual([
        { alt: 'Oil on canvas', url: `${ORIGIN}/api/media/file/default-hero.jpg` },
      ])
    })
  })

  describe('canonicals', () => {
    it('roots the path on the public origin', () => {
      const meta = pageMetadata({ path: '/gallery/portraits', settings: settings() })

      expect(meta.alternates?.canonical).toBe(`${ORIGIN}/gallery/portraits`)
      expect(og(meta).url).toBe(`${ORIGIN}/gallery/portraits`)
    })

    it('is omitted when the origin is not configured', () => {
      delete process.env.APP_URL

      const meta = pageMetadata({ path: '/gallery', settings: settings() })

      expect(meta.alternates).toBeUndefined()
      expect(og(meta).url).toBeUndefined()
    })

    it('accepts NEXT_PUBLIC_SERVER_URL and a trailing slash', () => {
      delete process.env.APP_URL
      process.env.NEXT_PUBLIC_SERVER_URL = `${ORIGIN}/`

      expect(pageMetadata({ path: '/gallery', settings: settings() }).alternates?.canonical).toBe(
        `${ORIGIN}/gallery`,
      )
    })
  })

  describe('site defaults', () => {
    it('declares the template child routes are suffixed with', () => {
      const meta = siteMetadata(settings({ seo: { metaTitle: 'Kristina Kostova · Portfolio' } }))

      expect(meta.title).toEqual({
        default: 'Kristina Kostova · Portfolio',
        template: '%s — Kristina Kostova',
      })
      expect(meta.metadataBase?.toString()).toBe(`${ORIGIN}/`)
    })

    /** A canonical here would be inherited by every route that sets none. */
    it('sets no canonical of its own', () => {
      expect(siteMetadata(settings()).alternates).toBeUndefined()
    })

    it('carries the default description and image into the card', () => {
      const meta = siteMetadata(
        settings({
          seo: {
            metaDescription: 'Paintings, comics and concept art.',
            ogImage: media({ sizes: { hero: { url: '/api/media/file/default-hero.jpg' } } }),
          },
        }),
      )

      expect(meta.description).toBe('Paintings, comics and concept art.')
      expect(og(meta).siteName).toBe('Kristina Kostova')
      expect(og(meta).images).toEqual([
        { alt: 'Oil on canvas', url: `${ORIGIN}/api/media/file/default-hero.jpg` },
      ])
    })
  })
})
