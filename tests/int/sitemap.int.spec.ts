/**
 * @vitest-environment node
 *
 * `/robots.txt` and `/sitemap.xml`.
 *
 * Split the way the modules are. `findSitemapContent` runs against Payload —
 * which documents reach a sitemap, and what timestamp each carries, are
 * properties of the query and nothing else will catch a regression in them.
 * `toSitemapEntries` and `robots` are pure and tested as such.
 *
 * Note that neither the cached `getSitemapContent` nor the route module itself
 * is exercised here: `unstable_cache` throws `Invariant: incrementalCache
 * missing` outside a Next server context, which is the same reason
 * `content.int.spec.ts` tests the finders in `@/lib/content/gallery` rather than
 * the wrappers in `@/lib/content/queries`.
 *
 * `getSiteUrl` reads `APP_URL` on every call, which is what lets these tests
 * move the origin around — and remove it, to cover the unconfigured case.
 */
import type { Album, Media } from '@/payload-types'

import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seedMedia } from '../helpers/seedMedia'
import config from '@/payload.config'
import { findSitemapContent, type SitemapContent } from '@/lib/content/sitemap'
import { getSiteUrl } from '@/lib/seo/metadata'
import { toSitemapEntries } from '@/lib/seo/sitemap'
import robots from '@/app/robots'

const PREFIX = 'zz-sitemap-test'
const ORIGIN = 'https://kristina.example'

const { APP_URL: ORIGINAL_APP_URL, NEXT_PUBLIC_SERVER_URL: ORIGINAL_SERVER_URL } = process.env

let payload: Payload
let media: Media
let album: Album
/** The most recently touched *published* artwork in `album`. */
let newestArtworkAt: string
/** Read once, after seeding — every assertion below reads the same snapshot. */
let content: SitemapContent

const restore = (key: 'APP_URL' | 'NEXT_PUBLIC_SERVER_URL', value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}

/** Runs `read` with no origin configured, then puts `ORIGIN` back. */
const withoutOrigin = <T>(read: () => T): T => {
  delete process.env.APP_URL
  delete process.env.NEXT_PUBLIC_SERVER_URL

  try {
    return read()
  } finally {
    process.env.APP_URL = ORIGIN
  }
}

const entries = () => toSitemapEntries({ content, siteUrl: getSiteUrl() })

describe('crawler metadata routes', () => {
  beforeAll(async () => {
    process.env.APP_URL = ORIGIN

    payload = await getPayload({ config: await config })
    media = await seedMedia({ enabled: true, name: `${PREFIX}-image`, payload })

    album = await payload.create({
      collection: 'albums',
      data: { published: true, slug: `${PREFIX}-album`, title: `${PREFIX} Album` },
      overrideAccess: true,
    })

    await payload.create({
      collection: 'albums',
      data: { published: false, slug: `${PREFIX}-hidden-album`, title: `${PREFIX} Hidden Album` },
      overrideAccess: true,
    })

    const artwork = await payload.create({
      collection: 'artworks',
      data: { album: album.id, image: media.id, published: true, title: `${PREFIX} Artwork` },
      overrideAccess: true,
    })

    newestArtworkAt = artwork.updatedAt

    // Created last, so it is the newest row in the album by some margin. It must
    // still not move the album's `lastmod`, because it renders nowhere.
    await payload.create({
      collection: 'artworks',
      data: { album: album.id, image: media.id, published: false, title: `${PREFIX} Draft` },
      overrideAccess: true,
    })

    await payload.create({
      collection: 'pages',
      data: { published: true, slug: `${PREFIX}-page`, title: `${PREFIX} Page` },
      overrideAccess: true,
    })

    await payload.create({
      collection: 'pages',
      data: { published: false, slug: `${PREFIX}-hidden-page`, title: `${PREFIX} Hidden Page` },
      overrideAccess: true,
    })

    content = await findSitemapContent({ payload })
  })

  afterAll(async () => {
    // Artworks first — deleting an album reassigns them to Uncategorized, which
    // would leave strays behind.
    await payload.delete({
      collection: 'artworks',
      overrideAccess: true,
      where: { title: { like: PREFIX } },
    })

    for (const collection of ['albums', 'pages'] as const) {
      await payload.delete({
        collection,
        overrideAccess: true,
        where: { slug: { like: PREFIX } },
      })
    }

    // By id: `media` has no queryable text field to match a prefix against.
    await payload.delete({ collection: 'media', id: media.id, overrideAccess: true })

    restore('APP_URL', ORIGINAL_APP_URL)
    restore('NEXT_PUBLIC_SERVER_URL', ORIGINAL_SERVER_URL)
  })

  describe('the sitemap query', () => {
    it("reports an album's newest published artwork as its last modification", () => {
      const entry = content.albums.find((row) => row.slug === album.slug)

      // The album document has not been touched since it was created, so an
      // unfolded timestamp would be `album.updatedAt` — strictly older.
      expect(entry?.updatedAt).toBe(newestArtworkAt)
      expect(entry?.updatedAt).not.toBe(album.updatedAt)
      expect(album.updatedAt < newestArtworkAt).toBe(true)
    })

    it('leaves out unpublished albums and pages', () => {
      expect(content.albums.map((row) => row.slug)).not.toContain(`${PREFIX}-hidden-album`)
      expect(content.pages.map((row) => row.slug)).not.toContain(`${PREFIX}-hidden-page`)
    })

    it('finds the published page', () => {
      expect(content.pages.map((row) => row.slug)).toContain(`${PREFIX}-page`)
    })
  })

  describe('the sitemap', () => {
    it('lists the fixed routes and every published document, absolutely', () => {
      const urls = entries().map((entry) => entry.url)

      expect(urls).toEqual(
        expect.arrayContaining([`${ORIGIN}/`, `${ORIGIN}/gallery`, `${ORIGIN}/contact`]),
      )
      expect(urls).toContain(`${ORIGIN}/gallery/${album.slug}`)
      expect(urls).toContain(`${ORIGIN}/${PREFIX}-page`)
      expect(urls.every((url) => url.startsWith(`${ORIGIN}/`))).toBe(true)
    })

    it('carries no timestamp on the aggregate routes and a real one on documents', () => {
      const byUrl = new Map(entries().map((entry) => [entry.url, entry]))

      expect(byUrl.get(`${ORIGIN}/`)?.lastModified).toBeUndefined()
      expect(byUrl.get(`${ORIGIN}/gallery`)?.lastModified).toBeUndefined()
      expect(byUrl.get(`${ORIGIN}/gallery/${album.slug}`)?.lastModified).toBe(newestArtworkAt)
    })

    it('never exposes the admin, the API or an invoice', () => {
      const paths = entries().map((entry) => new URL(entry.url).pathname)

      expect(paths.filter((path) => /^\/(admin|api|invoice)\b/.test(path))).toEqual([])
    })

    it('is empty rather than relative when no origin is configured', () => {
      expect(withoutOrigin(entries)).toEqual([])
    })
  })

  describe('robots.txt', () => {
    it('closes off the admin, the API and invoices', () => {
      expect(robots().rules).toMatchObject({
        disallow: ['/admin', '/api/', '/invoice/'],
        userAgent: '*',
      })
    })

    it('keeps the local media route crawlable despite the /api/ block', () => {
      expect(robots().rules).toMatchObject({ allow: ['/', '/api/media/file/'] })
    })

    it('points at an absolute sitemap URL', () => {
      expect(robots().sitemap).toBe(`${ORIGIN}/sitemap.xml`)
    })

    it('drops the sitemap line when no origin is configured', () => {
      expect(withoutOrigin(robots)).not.toHaveProperty('sitemap')
    })
  })
})
