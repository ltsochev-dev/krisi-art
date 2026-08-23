'use client'

/**
 * The album filter chips.
 *
 * The first paint is server-rendered — `initial` arrives already populated from
 * `getHomepageGallery()`, so the grid is in the HTML and needs no JS to be seen.
 * Only *toggling* a chip goes to the network, and it goes to the public
 * `/api/artworks/gallery` endpoint (`@/endpoints/gallery`) rather than to a
 * server action, because the response depends on nothing but the slugs and is
 * therefore cacheable.
 *
 * The fetch lives in the click handler rather than in an effect on `selected`:
 * an effect would need a "skip the first run" guard, which React's development
 * double-invoke defeats, and there is no state to synchronise here — only a
 * user action to respond to.
 */
import type { GalleryPage } from '@/lib/content/gallery'
import type { FeaturedAlbum } from '@/lib/content/queries'

import React, { useCallback, useRef, useState } from 'react'

export const GalleryFilter = ({
  albums,
  imagesPerAlbum,
  initial,
}: {
  albums: FeaturedAlbum[]
  imagesPerAlbum: number
  initial: GalleryPage
}) => {
  const [selected, setSelected] = useState<string[]>(() =>
    albums.filter((album) => album.selectedByDefault).map((album) => album.slug),
  )
  const [page, setPage] = useState(initial)
  const [pending, setPending] = useState(false)

  // Monotonic request id: chips can be clicked faster than the endpoint
  // answers, and only the newest response may win.
  const requestId = useRef(0)

  const toggle = useCallback(
    (slug: string) => {
      const next = selected.includes(slug)
        ? selected.filter((s) => s !== slug)
        : [...selected, slug]

      setSelected(next)
      setPending(true)

      const id = ++requestId.current

      const params = new URLSearchParams({
        albums: next.join(','),
        limit: String(Math.max(imagesPerAlbum * Math.max(next.length, 1), 1)),
      })

      void fetch(`/api/artworks/gallery?${params}`)
        .then(async (response) => (response.ok ? ((await response.json()) as GalleryPage) : null))
        .catch(() => null)
        .then((result) => {
          if (id !== requestId.current) {
            return
          }

          if (result) {
            setPage(result)
          }

          setPending(false)
        })
    },
    [imagesPerAlbum, selected],
  )

  return (
    <div>
      <ul>
        {albums.map((album) => (
          <li key={album.slug}>
            <label>
              <input
                checked={selected.includes(album.slug)}
                onChange={() => toggle(album.slug)}
                type="checkbox"
              />{' '}
              {album.title}
            </label>
          </li>
        ))}
      </ul>

      {albums.length === 0 ? (
        <p>
          <em>No albums configured on the homepage yet.</em>
        </p>
      ) : null}

      <p>
        <small>
          {pending ? 'Loading…' : `${page.artworks.length} of ${page.totalDocs} artwork(s) shown.`}
        </small>
      </p>

      <ul>
        {page.artworks.map((artwork) => (
          <li key={artwork.id}>
            {artwork.image ? (
              <img
                alt={artwork.image.alt}
                src={artwork.image.sizes.card ?? artwork.image.url ?? ''}
                width={200}
              />
            ) : null}
            <div>
              <strong>{artwork.title}</strong>
              {artwork.year ? ` (${artwork.year})` : null} — {artwork.album.title}
            </div>
            <div>
              <small>
                {[artwork.medium, artwork.dimensions].filter(Boolean).join(' · ')}
                {artwork.tags.length ? ` · tags: ${artwork.tags.join(', ')}` : null}
              </small>
            </div>
            {artwork.description ? <p>{artwork.description}</p> : null}
          </li>
        ))}
      </ul>

      {page.artworks.length === 0 && !pending ? (
        <p>
          <em>Nothing to show for the current selection.</em>
        </p>
      ) : null}
    </div>
  )
}
