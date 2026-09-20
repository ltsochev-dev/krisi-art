'use client'

/**
 * The photo grid, and the full-screen viewer behind it.
 *
 * Written from scratch rather than reusing `@/components/Lightbox`, for two
 * reasons that both come down to this page not being the portfolio. That
 * component is styled entirely in Tailwind utilities, and this route group
 * deliberately loads `commission.css` instead of the site's stylesheet — so its
 * classes would resolve to nothing here. It also reports to PostHog and animates
 * through `motion`, neither of which belongs on a page someone's friends open to
 * look at holiday photographs.
 *
 * **The `src` of every image is already a signed URL.** The server minted them
 * during the render (see `@/lib/commissions/gallery`), which is why the grid can
 * paint without a round trip per photo and why nothing here asks the server for
 * anything until someone presses Download.
 *
 * **The images are the artist's originals**, at whatever size they came off the
 * camera — there are no resized derivatives in the private bucket. Hence
 * `loading="lazy"` on the grid, so a forty-photo album fetches what is on screen
 * and not the rest, and hence the viewer rendering the same object rather than a
 * larger one: there is no larger one.
 */
import React, { useCallback, useEffect, useState } from 'react'

import type { CommissionGalleryImage } from '@/lib/commissions/gallery'

import { formatSize } from './CommissionFiles'
import { useCommissionDownload } from './useCommissionDownload'
import { useCommissionView } from './useCommissionView'

export default function CommissionGallery({
  images,
  uuid,
}: {
  images: CommissionGalleryImage[]
  uuid: string
}) {
  const [index, setIndex] = useState<null | number>(null)
  const { download, errors, pendingFileId } = useCommissionDownload(uuid)

  useCommissionView(uuid)

  const open = index !== null
  const image = index === null ? undefined : images[index]

  // Wraps at both ends, so arrowing past the last photo returns to the first
  // rather than dead-ending.
  const step = useCallback(
    (delta: number) => {
      setIndex((current) =>
        current === null || images.length === 0
          ? current
          : (current + delta + images.length) % images.length,
      )
    },
    [images.length],
  )

  const close = useCallback(() => setIndex(null), [])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      } else if (event.key === 'ArrowRight') {
        step(1)
      } else if (event.key === 'ArrowLeft') {
        step(-1)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    // The overlay scrolls nothing itself, so let the page behind it stay put
    // instead of scrolling under the backdrop.
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
    }
  }, [close, open, step])

  if (images.length === 0) {
    return <p className="note">There are no photos in this album yet.</p>
  }

  return (
    <>
      <ul className="gallery">
        {images.map((photo, position) => (
          <li key={photo.fileId}>
            <button
              aria-label={`Open ${photo.name}`}
              className="gallery__item"
              onClick={() => setIndex(position)}
              type="button"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={photo.name}
                className="gallery__image"
                decoding="async"
                loading="lazy"
                src={photo.url}
              />
            </button>
          </li>
        ))}
      </ul>

      {image ? (
        <div
          aria-label={image.name}
          aria-modal="true"
          className="viewer"
          onClick={close}
          role="dialog"
        >
          <button
            aria-label="Close"
            className="viewer__control viewer__close"
            onClick={close}
            type="button"
          >
            ✕
          </button>

          {images.length > 1 ? (
            <>
              <button
                aria-label="Previous photo"
                className="viewer__control viewer__previous"
                onClick={(event) => {
                  event.stopPropagation()
                  step(-1)
                }}
                type="button"
              >
                ‹
              </button>
              <button
                aria-label="Next photo"
                className="viewer__control viewer__next"
                onClick={(event) => {
                  event.stopPropagation()
                  step(1)
                }}
                type="button"
              >
                ›
              </button>
            </>
          ) : null}

          {/* Clicking the backdrop closes; the figure stops propagation so
              clicking the photo itself does not. */}
          <figure className="viewer__figure" onClick={(event) => event.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={image.name} className="viewer__image" src={image.url} />

            <figcaption className="viewer__caption">
              <span className="viewer__name">{image.name}</span>
              <span className="viewer__meta">
                {[
                  formatSize(image.filesize),
                  images.length > 1 ? `${(index ?? 0) + 1} / ${images.length}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>

              <button
                className="button"
                disabled={pendingFileId === image.fileId}
                onClick={() => void download(image.fileId)}
                type="button"
              >
                {pendingFileId === image.fileId ? 'Preparing…' : 'Download original'}
              </button>

              {errors[image.fileId] ? (
                <p className="file__error" role="alert">
                  {errors[image.fileId]}
                </p>
              ) : null}
            </figcaption>
          </figure>
        </div>
      ) : null}
    </>
  )
}
