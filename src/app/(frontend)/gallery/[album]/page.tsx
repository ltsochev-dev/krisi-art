/**
 * One album, uncapped — the page the homepage's six-per-album preview links to.
 *
 * `getGalleryAlbum` returns null for an unknown *or* unpublished slug, so both
 * 404 rather than rendering a heading over an empty grid. Every artwork ships in
 * one payload and the cards lazy-load offscreen images; there is no paging.
 *
 * Rendered per request like every other `(frontend)` route — see the note on
 * `dynamic` in the layout. Enumerating the albums for `generateStaticParams`
 * would mean querying Payload from the Docker builder stage, which has neither
 * a secret nor a migrated database; the cached reads in `@/lib/content/queries`
 * are what keep the per-request path cheap.
 */
import type { Metadata } from 'next'

import Link from 'next/link'
import { notFound } from 'next/navigation'

import ArtworkGrid from '@/components/ArtworkGrid'
import { getGalleryAlbum, getSiteSettings } from '@/lib/content/queries'
import { pageMetadata } from '@/lib/seo/metadata'

type Props = { params: Promise<{ album: string }> }

/**
 * Albums carry no SEO fields of their own, so the title and description are the
 * album's, and the card image is its first artwork.
 *
 * That first artwork is also the album's cover on the gallery index — the two
 * queries sort identically (see `findGalleryAlbums`) — so the link preview shows
 * the same image the index does, without a second read for it.
 *
 * An unknown or unpublished slug returns nothing: the route 404s a line later,
 * and the layout's own title is the right one for that.
 */
export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { album: slug } = await params
  const [album, settings] = await Promise.all([getGalleryAlbum(slug), getSiteSettings()])

  if (!album) {
    return {}
  }

  return pageMetadata({
    description: album.description,
    image: album.artworks[0]?.image,
    path: `/gallery/${album.slug}`,
    settings,
    title: album.title,
  })
}

const AlbumPage = async ({ params }: Props) => {
  const { album: slug } = await params
  const album = await getGalleryAlbum(slug)

  if (!album) {
    notFound()
  }

  return (
    <section className="bg-background py-32 md:py-40">
      <div className="container mx-auto px-6">
        <header className="mb-16 text-center">
          <Link
            href="/gallery"
            className="mb-6 inline-block font-sans text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            ← All albums
          </Link>
          <h1 className="mb-4 font-serif text-4xl text-foreground md:text-5xl">{album.title}</h1>
          <div className="section-divider mb-6" />
          {album.description && (
            <p className="mx-auto max-w-xl text-muted-foreground">{album.description}</p>
          )}
        </header>

        <ArtworkGrid artworks={album.artworks} emptyMessage="No work in this album yet." />
      </div>
    </section>
  )
}

export default AlbumPage
