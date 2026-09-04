/**
 * Gallery index — every published album as a card, linking into its own page.
 *
 * A static segment, so it takes precedence over the `[slug]` route next to it.
 * That also means a CMS page slugged `gallery` would be unreachable; nothing in
 * the `pages` collection uses it today.
 *
 * Server-rendered. The cards are plain links with no lightbox, so unlike the
 * album pages nothing here needs a client boundary.
 */
import type { Metadata } from 'next'

import Link from 'next/link'

import { getGalleryAlbums, getSiteSettings } from '@/lib/content/queries'
import { pageMetadata } from '@/lib/seo/metadata'

const GALLERY_TITLE = 'Gallery'

const GALLERY_DESCRIPTION =
  'Every album, from character design and comics to portraits and folk scenes.'

/**
 * No CMS fields back this route — the heading and blurb below are code, not copy
 * — so the title and description are the constants above. It still goes through
 * `pageMetadata` for the canonical URL and for the site's default OG image,
 * which is otherwise the one thing a static object here cannot pick up.
 */
export const generateMetadata = async (): Promise<Metadata> =>
  pageMetadata({
    description: GALLERY_DESCRIPTION,
    path: '/gallery',
    settings: await getSiteSettings(),
    title: GALLERY_TITLE,
  })

const countLabel = (count: number): string => (count === 1 ? '1 piece' : `${count} pieces`)

const GalleryIndexPage = async () => {
  const albums = await getGalleryAlbums()

  return (
    <section className="bg-background py-32 md:py-40">
      <div className="container mx-auto px-6">
        <header className="mb-16 text-center">
          <h1 className="mb-4 font-serif text-4xl text-foreground md:text-5xl">{GALLERY_TITLE}</h1>
          <div className="section-divider mb-6" />
          <p className="mx-auto max-w-xl text-muted-foreground">
            Every album in full — pick one to see all of it.
          </p>
        </header>

        {albums.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">No albums published yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {albums.map((album) => (
              <Link
                key={album.slug}
                href={`/gallery/${album.slug}`}
                className="gallery-card group block rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                <div className="relative aspect-4/5 overflow-hidden rounded-lg">
                  {album.cover ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={album.cover.sizes.card ?? album.cover.url ?? ''}
                      alt={album.cover.alt ?? album.title}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted">
                      <span className="font-sans text-xs tracking-widest text-muted-foreground uppercase">
                        Empty
                      </span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-linear-to-t from-background/95 via-background/30 to-transparent" />

                  <div className="absolute right-0 bottom-0 left-0 p-6">
                    <span className="mb-2 block font-sans text-xs tracking-widest text-primary uppercase">
                      {countLabel(album.artworkCount)}
                    </span>
                    <h2 className="font-serif text-2xl text-foreground">{album.title}</h2>
                    {album.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {album.description}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export default GalleryIndexPage
