/**
 * Page metadata, assembled from the CMS.
 *
 * A shared builder rather than a hand-rolled object per route, for two reasons:
 *
 * - Next merges metadata across segments **shallowly**, and `openGraph` is one
 *   nested key. A page that sets any `openGraph` field replaces the layout's
 *   whole block instead of adding to it, so every route has to emit a complete
 *   card rather than a patch. See "Ordering" and the merging note in
 *   `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`.
 * - The fallback chain — page field, then the `site-settings` default, then the
 *   site name — is identical on every route and is the part that is easy to get
 *   subtly wrong.
 *
 * `openGraph.title` and `openGraph.description` are always set explicitly: Next
 * does not copy `title`/`description` into them, and `title.template` applies to
 * the document title only, so the suffix has to be applied here by hand.
 */
import type { Metadata } from 'next'

import type { GalleryImage } from '@/lib/content/gallery'
import type { SiteSetting } from '@/payload-types'

import { toGalleryImage } from '@/lib/content/gallery'

/** Matches the `lang` on `<html>` and the locale the copy pages format dates in. */
const OG_LOCALE = 'en_GB'

const TITLE_SEPARATOR = ' — '

/**
 * Where a description gets cut.
 *
 * Search engines truncate around 160 characters and link previews around 200.
 * The fields these come from are page copy — a contact intro, an album blurb —
 * so without a clamp a three-paragraph textarea ships whole into a `<meta>` tag.
 */
const DESCRIPTION_MAX = 200

type OgImage = { alt?: string; height?: number; url: string; width?: number }

/**
 * Public origin, or `undefined` when it is not configured.
 *
 * Deliberately non-throwing, unlike `getAppUrl` in `@/lib/auth/cognito/config`:
 * there a missing origin breaks sign-in and has to be loud, whereas here it only
 * costs absolute URLs in link previews. Metadata is not worth a 500 over.
 */
export const getSiteUrl = (): undefined | URL => {
  const raw = (process.env.APP_URL || process.env.NEXT_PUBLIC_SERVER_URL)?.trim()

  if (!raw) {
    return undefined
  }

  try {
    return new URL(raw.replace(/\/+$/, ''))
  } catch {
    return undefined
  }
}

/**
 * Resolves against the public origin, and gives up rather than emitting a
 * relative URL.
 *
 * Both halves matter. Media URLs are absolute already when `S3_CDN_URL` is set
 * and relative (`/api/media/file/...`) when it is not, so a CDN-backed card
 * still works with no origin configured. And `og:image` has to be absolute to be
 * fetchable at all — a relative one is worse than none, which is why an
 * unresolvable URL drops the field instead.
 */
const toAbsolute = (url: string, siteUrl: undefined | URL): string | undefined => {
  try {
    return new URL(url, siteUrl).toString()
  } catch {
    return undefined
  }
}

/** One tidy line, clamped — a `<meta>` description, not a textarea. */
const toDescription = (value: null | string | undefined): string | undefined => {
  const text = value?.replace(/\s+/g, ' ').trim()

  if (!text) {
    return undefined
  }

  if (text.length <= DESCRIPTION_MAX) {
    return text
  }

  const cut = text.slice(0, DESCRIPTION_MAX)
  const lastSpace = cut.lastIndexOf(' ')

  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, '')}…`
}

const toTitle = (value: null | string | undefined): string | undefined => {
  const text = value?.replace(/\s+/g, ' ').trim()

  return text ? text : undefined
}

/**
 * The best rendition of an image for a link preview.
 *
 * `hero` (1920w) then `tablet` (1024w): crawlers want the long edge around
 * 1200px, and those two are the renditions that keep the source format, where
 * `card` and `thumbnail` are WEBP — hence both sitting below the original.
 *
 * Dimensions are reported only for the original, the one rendition whose size
 * `GalleryImage` carries. A guessed `og:image:width` is worse than none.
 *
 * The input is a `GalleryImage`, so `media.enabled` has already been honoured by
 * `toGalleryImage` — the single chokepoint for that flag (see
 * `@/lib/content/gallery`). An upload nobody has marked ready stays out of link
 * previews for the same reason it stays off the page.
 */
const toOgImage = (
  image: GalleryImage | null | undefined,
  siteUrl: undefined | URL,
): OgImage | undefined => {
  if (!image) {
    return undefined
  }

  const derivative = image.sizes.hero ?? image.sizes.tablet
  const source = derivative ?? image.url ?? image.sizes.card ?? image.sizes.thumbnail
  const url = source ? toAbsolute(source, siteUrl) : undefined

  if (!url) {
    return undefined
  }

  const isOriginal = !derivative && source === image.url

  return {
    // Omitted rather than sent empty when the upload has no alt of its own —
    // `og:image:alt` is optional, and a blank one is worse than none.
    ...(image.alt ? { alt: image.alt } : {}),
    ...(isOriginal && image.height && image.width
      ? { height: image.height, width: image.width }
      : {}),
    url,
  }
}

/** Site-wide defaults, in one place so both builders read them the same way. */
const defaultsFrom = (settings: SiteSetting, siteUrl: undefined | URL) => ({
  description: toDescription(settings.seo?.metaDescription) ?? toDescription(settings.tagline),
  image: toOgImage(toGalleryImage(settings.seo?.ogImage), siteUrl),
  title: toTitle(settings.seo?.metaTitle) ?? settings.siteName,
})

const card = ({
  description,
  image,
  siteName,
  title,
  url,
}: {
  description: string | undefined
  image: OgImage | undefined
  siteName: string
  title: string
  url: string | undefined
}): Pick<Metadata, 'openGraph' | 'twitter'> => ({
  openGraph: {
    ...(description ? { description } : {}),
    ...(image ? { images: [image] } : {}),
    locale: OG_LOCALE,
    siteName,
    title,
    type: 'website',
    ...(url ? { url } : {}),
  },
  twitter: {
    // `summary` rather than a large card with nothing to put in it: X renders an
    // empty image slot for `summary_large_image` when no image resolves.
    card: image ? 'summary_large_image' : 'summary',
    ...(description ? { description } : {}),
    ...(image ? { images: [image] } : {}),
    title,
  },
})

/**
 * The root layout's metadata: the site defaults, plus the pieces that only make
 * sense once per document.
 *
 * `title.template` applies to **child** segments only, never to the segment that
 * declares it — so `title.default` here is what a route with no title of its own
 * (a 404) falls back to, and every page below gets the site name appended.
 *
 * No `alternates` on purpose: a canonical URL set here would be inherited by any
 * route that does not set its own, which would point a 404 at the homepage.
 */
export const siteMetadata = (settings: SiteSetting): Metadata => {
  const siteUrl = getSiteUrl()
  const defaults = defaultsFrom(settings, siteUrl)

  return {
    ...(defaults.description ? { description: defaults.description } : {}),
    ...(siteUrl ? { metadataBase: siteUrl } : {}),
    ...card({
      description: defaults.description,
      image: defaults.image,
      siteName: settings.siteName,
      title: defaults.title,
      url: siteUrl?.toString(),
    }),
    title: {
      default: defaults.title,
      template: `%s${TITLE_SEPARATOR}${settings.siteName}`,
    },
  }
}

export type PageMetadataInput = {
  /**
   * Treat `title` as the whole document title, ignoring the layout's template.
   *
   * What the homepage wants: its `metaTitle` is the complete title rather than a
   * section name, so it must not pick up a second copy of the site name.
   */
  absoluteTitle?: boolean
  /** Overrides the site default. Plain text; collapsed and clamped. */
  description?: null | string
  /**
   * Overrides the site default. Already projected through `toGalleryImage`, so
   * pass `toGalleryImage(doc.ogImage)` for a raw upload field.
   */
  image?: GalleryImage | null
  /** Route path, rooted — `/contact`, `/gallery/portraits`. */
  path: string
  settings: SiteSetting
  /** Falls back to the site's default SEO title, then to the site name. */
  title?: null | string
}

/**
 * One route's metadata, with the site defaults filled in behind it.
 *
 * Emits the full `openGraph`/`twitter` card every time — see the note at the top
 * of this module on shallow merging.
 */
export const pageMetadata = ({
  absoluteTitle = false,
  description,
  image,
  path,
  settings,
  title,
}: PageMetadataInput): Metadata => {
  const siteUrl = getSiteUrl()
  const defaults = defaultsFrom(settings, siteUrl)

  const ownTitle = toTitle(title)
  const resolvedTitle = ownTitle ?? defaults.title
  const resolvedDescription = toDescription(description) ?? defaults.description
  const resolvedImage = toOgImage(image, siteUrl) ?? defaults.image
  const canonical = toAbsolute(path, siteUrl)

  /**
   * The suffix belongs to a *section* name. A route that supplies no title of
   * its own has fallen back to the site's own default title, and appending the
   * site name to that would read "Kristina Kostova — Kristina Kostova".
   */
  const suffixed = Boolean(ownTitle) && !absoluteTitle

  return {
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(resolvedDescription ? { description: resolvedDescription } : {}),
    ...card({
      description: resolvedDescription,
      image: resolvedImage,
      siteName: settings.siteName,
      // The template is a document-title feature; `og:title` has to carry the
      // suffix itself or the two disagree.
      title: suffixed ? `${resolvedTitle}${TITLE_SEPARATOR}${settings.siteName}` : resolvedTitle,
      url: canonical,
    }),
    title: suffixed ? resolvedTitle : { absolute: resolvedTitle },
  }
}
