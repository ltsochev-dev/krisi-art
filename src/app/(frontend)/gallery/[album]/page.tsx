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
import { getGalleryAlbum } from '@/lib/content/queries'

type Props = { params: Promise<{ album: string }> }

export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { album: slug } = await params
  const album = await getGalleryAlbum(slug)

  if (!album) {
    return {}
  }

  return {
    title: album.title,
    ...(album.description ? { description: album.description } : {}),
  }
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
