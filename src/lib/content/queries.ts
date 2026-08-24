/**
 * Cached read helpers for the frontend.
 *
 * Every helper here:
 *
 * - runs on the server through the Local API (no HTTP round-trip),
 * - filters to published content explicitly rather than trusting the caller,
 * - is wrapped in `unstable_cache` and tagged, so the Payload hooks in
 *   `@/lib/hooks/revalidate` invalidate it on the next admin edit.
 *
 * `unstable_cache` (rather than the newer `use cache` / `cacheTag`) is the right
 * API here because `cacheComponents` is not enabled in `next.config.ts`. See
 * `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`.
 *
 * Note the deliberate `overrideAccess: true` throughout: these run without a
 * user, and the `published` constraints are the access boundary. Anything that
 * has to respect a specific *visitor's* permissions must not use these helpers.
 */
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import type { Album, ContactPage, Homepage, Page, SiteSetting, Testimonial } from '@/payload-types'
import type { GalleryArtwork, GalleryImage, GalleryPage } from '@/lib/content/gallery'

import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { findGalleryArtworks, isPopulated, takePerAlbum, toGalleryImage } from '@/lib/content/gallery'
import config from '@/payload.config'

export type { GalleryArtwork, GalleryImage, GalleryPage } from '@/lib/content/gallery'

const payloadInstance = async () => await getPayload({ config: await config })

// --- Globals ---------------------------------------------------------------

export const getSiteSettings = unstable_cache(
  async (): Promise<SiteSetting> => {
    const payload = await payloadInstance()

    return await payload.findGlobal({ slug: 'site-settings', depth: 1, overrideAccess: true })
  },
  ['site-settings'],
  { tags: [CACHE_TAGS.siteSettings, CACHE_TAGS.media] },
)

export const getHomepage = unstable_cache(
  async (): Promise<Homepage> => {
    const payload = await payloadInstance()

    // depth 2 so the album relationships inside the gallery array and the media
    // inside the about-image rows both come back populated.
    return await payload.findGlobal({ slug: 'homepage', depth: 2, overrideAccess: true })
  },
  ['homepage'],
  { tags: [CACHE_TAGS.homepage, CACHE_TAGS.albums, CACHE_TAGS.media] },
)

export const getContactPage = unstable_cache(
  async (): Promise<ContactPage> => {
    const payload = await payloadInstance()

    return await payload.findGlobal({ slug: 'contact-page', depth: 0, overrideAccess: true })
  },
  ['contact-page'],
  { tags: [CACHE_TAGS.contactPage] },
)

// --- Homepage projections --------------------------------------------------

export type FeaturedAlbum = {
  description: null | string
  id: number
  selectedByDefault: boolean
  slug: string
  title: string
}

/**
 * The gallery chips, in the order the editor arranged them.
 *
 * Rows pointing at an unpublished or deleted album are dropped rather than
 * rendered as a chip that would return nothing when toggled on.
 */
export const getFeaturedAlbums = async (): Promise<FeaturedAlbum[]> => {
  const homepage = await getHomepage()

  return (homepage.albums ?? []).flatMap((row) => {
    if (!isPopulated<Album>(row.album) || !row.album.published) {
      return []
    }

    const album = row.album

    return [
      {
        description: album.description ?? null,
        id: album.id,
        selectedByDefault: row.selectedByDefault ?? false,
        slug: album.slug,
        title: album.title,
      },
    ]
  })
}

export type AboutSection = {
  body: null | string
  heading: string
  images: { caption: null | string; image: GalleryImage | null }[]
  stats: { label: string; value: string }[]
}

export const getAboutSection = async (): Promise<AboutSection> => {
  const homepage = await getHomepage()

  return {
    body: homepage.aboutBody ?? null,
    heading: homepage.aboutHeading,
    images: (homepage.aboutImages ?? []).map((row) => ({
      caption: row.caption ?? null,
      image: toGalleryImage(row.image),
    })),
    stats: (homepage.stats ?? []).map((row) => ({ label: row.label, value: row.value })),
  }
}

export type HeroSection = {
  heading: string
  image: GalleryImage | null
  skills: string[]
  subheading: null | string
}

export const getHeroSection = async (): Promise<HeroSection> => {
  const homepage = await getHomepage()

  return {
    heading: homepage.heading,
    image: toGalleryImage(homepage.image),
    // Row order is the chip order; the array is flattened to plain strings so
    // the component never sees Payload's row wrappers.
    skills: (homepage.skills ?? []).map((row) => row.label),
    subheading: homepage.subheading ?? null,
  }
}

// --- Pages -----------------------------------------------------------------

/**
 * A standalone page by slug, or `null` when there is no published page there.
 *
 * The `unstable_cache` key includes the slug, so every page gets its own entry
 * and they all carry the same tag — one edit in the admin drops the lot, which is
 * cheap for a handful of copy pages.
 */
export const getPage = unstable_cache(
  async (slug: string): Promise<null | Page> => {
    const payload = await payloadInstance()

    const { docs } = await payload.find({
      collection: 'pages',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: { and: [{ slug: { equals: slug } }, { published: { equals: true } }] },
    })

    return docs[0] ?? null
  },
  ['page'],
  { tags: [CACHE_TAGS.pages] },
)

// --- Testimonials ----------------------------------------------------------

/**
 * Published testimonials, in the order the editor arranged them.
 *
 * `limit: 0` is Payload's "no limit" — the set is small and the homepage renders
 * all of it, so paginating here would only add a second read. `depth: 0` because
 * the collection holds no relationships: the socials rows are an array field and
 * come back inline either way.
 */
export const getTestimonials = unstable_cache(
  async (): Promise<Testimonial[]> => {
    const payload = await payloadInstance()

    const { docs } = await payload.find({
      collection: 'testimonials',
      depth: 0,
      limit: 0,
      overrideAccess: true,
      sort: 'sortOrder',
      where: { published: { equals: true } },
    })

    return docs
  },
  ['testimonials'],
  { tags: [CACHE_TAGS.testimonials] },
)

// --- Gallery ---------------------------------------------------------------

/**
 * Cached gallery artworks for a set of album slugs.
 *
 * The `unstable_cache` key includes the arguments, so each distinct chip
 * combination gets its own entry — all of them tagged, so one artwork edit drops
 * the lot rather than leaving stale combinations behind.
 */
export const getGalleryArtworks = unstable_cache(
  async (args: { albumSlugs: string[] }): Promise<GalleryPage> => {
    const payload = await payloadInstance()

    return await findGalleryArtworks({ ...args, payload })
  },
  ['gallery-artworks'],
  { tags: [CACHE_TAGS.artworks, CACHE_TAGS.albums, CACHE_TAGS.media] },
)

/**
 * How many artworks each album contributes to the homepage grid.
 *
 * A constant rather than an editable field: the homepage layout is built around
 * a preview-sized grid, so this is a design decision rather than copy.
 */
export const HOMEPAGE_IMAGES_PER_ALBUM = 6

export type HomepageGallery = {
  albums: FeaturedAlbum[]
  /**
   * Up to `HOMEPAGE_IMAGES_PER_ALBUM` artworks per album, in album order then
   * album-local order.
   */
  artworks: GalleryArtwork[]
  /** `sectionTitle` on the global. */
  heading: string
  /** `sectionSubtitle` on the global. Plain text; blank lines are paragraphs. */
  subheading: null | string
}

/**
 * The whole homepage gallery section: the copy, the chips, and every artwork
 * behind them.
 *
 * All of it ships in one payload so the chips filter in the browser — there is
 * no second request when one is toggled, and no chip can land on an empty grid
 * just because its album was not the one selected on the server. Each album is
 * capped at `HOMEPAGE_IMAGES_PER_ALBUM`, so this is a preview of every album
 * rather than the whole catalogue.
 *
 * The copy rides along here rather than being read off `getHomepage()` at the
 * call site, so the page asks for the gallery *section* and gets all of it —
 * same shape as `getHeroSection` and `getAboutSection`. The global read is
 * already happening below, so this costs nothing.
 */
export const getHomepageGallery = async (): Promise<HomepageGallery> => {
  const [homepage, albums] = await Promise.all([getHomepage(), getFeaturedAlbums()])

  const { artworks } = await getGalleryArtworks({
    albumSlugs: albums.map((album) => album.slug),
  })

  return {
    albums,
    artworks: takePerAlbum(artworks, HOMEPAGE_IMAGES_PER_ALBUM),
    heading: homepage.sectionTitle,
    subheading: homepage.sectionSubtitle ?? null,
  }
}
