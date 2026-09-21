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
 * **Every `src` here is already a signed URL.** The server minted them during
 * the render (see `@/lib/commissions/gallery`), which is why the grid can paint
 * without a round trip per photo and why nothing here asks the server for
 * anything until someone presses Download.
 *
 * **The grid draws a stored preview; the viewer draws the original.** Each
 * photograph is two objects in the bucket: the artist's upload, and a 512px
 * WebP made from it when the file was registered. A tile is therefore a
 * twenty-kilobyte `GET` straight from S3, and this app is not in the path of it
 * at all.
 *
 * That last part is the whole design, and it was arrived at the hard way. The
 * first version drew every tile from the full-resolution original and let the
 * browser scale it down: gigabytes over the wire and 150 twenty-megapixel
 * decodes into the compositor, which is enough to bring a sixteen-core desktop
 * to its knees — a browser has no way to know that the 6000px image it is
 * decoding is about to be painted into a 150px box. The second put the tiles
 * through `next/image`, so this app's optimiser fetched each original
 * server-side and served a few-kilobyte WebP; that fixed the browser and moved
 * the problem onto the VPS, where the optimiser's hardcoded seven-second
 * upstream fetch timeout turned a burst of tiles into a grid of 504s — and,
 * with enough concurrent decodes, took the host down with it.
 * `@/lib/commissions/thumbnails` writes that story down in full. Resizing once,
 * at upload, is the version with no such cliff in it.
 *
 * **A row with no preview therefore draws nothing at all** — a plain tile, and
 * no request of any kind. That is deliberate and it is the lesson of the
 * outage: the earlier version of this file fell back to `next/image` on the
 * original, which meant an album whose previews had not been generated yet
 * could still flood the server exactly as before, and whether it did came down
 * to the order someone happened to do things in. A fallback that cannot be
 * reached by accident is worth more here than a prettier grid. The photograph
 * is still one click away — the viewer loads the original straight from S3 —
 * and *Generate previews* in the admin uploader fills the tiles in.
 *
 * Nothing on a commission page goes through the image optimiser any more, in
 * either layout.
 *
 * Opening a photo still shows the original, at whatever size it came off the
 * camera. Where a preview exists it arrives over the copy the grid already
 * loaded, so the viewer has something sharp-ish on screen immediately instead
 * of a black rectangle for as long as a 15MB JPEG takes; where one does not, it
 * fades in over an empty frame.
 */
import React, { useCallback, useEffect, useState } from 'react'

import type { CommissionGalleryImage } from '@/lib/commissions/gallery'

import { formatSize } from './CommissionFiles'
import { useCommissionDownload } from './useCommissionDownload'
import { useCommissionView } from './useCommissionView'

/**
 * One tile's picture: the stored preview, or nothing.
 *
 * The `img` needs no intrinsic dimensions — the stylesheet has already sized
 * the square it paints into — and `loading="lazy"` is what makes a 220-photo
 * album cost only the screenful someone is actually looking at.
 *
 * With no preview it renders an empty box rather than reaching for the
 * original. See the note at the top of this file: that is the difference
 * between an album that looks unfinished and one that can take a small VPS off
 * the internet.
 */
function CommissionTile({ image }: { image: CommissionGalleryImage }) {
  if (!image.thumbUrl) {
    return <span aria-hidden="true" className="gallery__pending" />
  }

  return (
    // A plain `img`, because the file is already the size it will be drawn at.
    // Putting it through `next/image` would be a round trip through this server
    // to hand back the bytes it was given.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={image.name}
      className="gallery__image"
      decoding="async"
      loading="lazy"
      src={image.thumbUrl}
    />
  )
}

export default function CommissionGallery({
  images,
  uuid,
}: {
  images: CommissionGalleryImage[]
  uuid: string
}) {
  const [index, setIndex] = useState<null | number>(null)
  /**
   * The `fileId` of the original that has finished loading, so the viewer knows
   * when to fade it in over the placeholder. Held as an id rather than a boolean
   * so that arrowing to the next photo is self-resetting: a different photo is
   * simply not the one that loaded.
   */
  const [loadedId, setLoadedId] = useState<null | string>(null)
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

  /**
   * Photographs whose preview has not been generated yet, which draw as empty
   * tiles. Said out loud under the grid rather than left as a mystery: a
   * visitor who sees blank squares should know they are not broken and that the
   * pictures are still there.
   */
  const pending = images.filter((photo) => !photo.thumbUrl).length

  const pendingNote =
    pending === images.length
      ? 'These photos are still being prepared, so the grid is blank for now'
      : pending === 1
        ? 'One of these photos is still being prepared'
        : `${pending} of these photos are still being prepared`

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
              <CommissionTile image={photo} />
            </button>
          </li>
        ))}
      </ul>

      {pending > 0 ? (
        <p className="note">{pendingNote} — open one to see it full size in the meantime.</p>
      ) : null}

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
            <div className="viewer__frame">
              {/*
               * The placeholder, and deliberately the *same* request the grid
               * has already made: identical `src`, so the browser serves it
               * from cache and the viewer has something on screen in the frame
               * the click happened in.
               *
               * Stretched far past its own size, which is exactly what a
               * placeholder is: soft for the moment it takes the original to
               * arrive over the top of it. It keeps the photograph's own aspect
               * ratio, so it lands in the frame at the shape the real picture is
               * about to occupy.
               *
               * It is not the photograph as far as assistive technology is
               * concerned — the original below carries the name. And with no
               * preview stored there is simply nothing here: the original fades
               * in over an empty frame instead of over a soft version of
               * itself.
               */}
              {image.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  aria-hidden="true"
                  className="viewer__preview"
                  decoding="async"
                  src={image.thumbUrl}
                />
              ) : null}

              {/*
               * The original, straight from the signed URL — no optimiser, no
               * resizing, the file the artist uploaded. It fades in over the
               * placeholder once the browser has it.
               *
               * A plain `img`, because `next/image` exists to *not* do this.
               */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={image.name}
                className="viewer__image"
                data-loaded={loadedId === image.fileId ? 'true' : undefined}
                decoding="async"
                key={image.fileId}
                onLoad={() => setLoadedId(image.fileId)}
                src={image.url}
              />
            </div>

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
