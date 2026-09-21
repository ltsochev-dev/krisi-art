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
 * upstream fetch timeout turned a burst of tiles into a grid of 504s.
 * `@/lib/commissions/thumbnails` writes that story down in full. Resizing once,
 * at upload, is the version with no such cliff in it.
 *
 * A row with no preview — uploaded before they existed, or one whose resize
 * failed — still goes through `next/image` on the original, which is the second
 * arrangement above and is fine for a handful of photos at a time. *Generate
 * previews* in the admin uploader is what clears that backlog for an album.
 * `next.config.ts` carries the `remotePatterns` entry that authorises the
 * bucket's host, without which those fallback tiles 400.
 *
 * Opening a photo still shows the original, at whatever size it came off the
 * camera. It arrives over the preview the grid already loaded, so the viewer
 * has something sharp-ish on screen immediately instead of a black rectangle
 * for as long as a 15MB JPEG takes.
 */
import React, { useCallback, useEffect, useState } from 'react'

import Image from 'next/image'

import type { CommissionGalleryImage } from '@/lib/commissions/gallery'

import { formatSize } from './CommissionFiles'
import { useCommissionDownload } from './useCommissionDownload'
import { useCommissionView } from './useCommissionView'

/**
 * The size the image optimiser is asked for on the fallback path — a row with
 * no stored preview — and nothing else.
 *
 * It describes the *tile*: the grid is `repeat(auto-fill, minmax(9rem, 1fr))`
 * inside a 68rem column, so a tile is around 150px on a wide monitor and about
 * half the viewport on a phone. Next rounds this up to its own size list and
 * emits two candidates, 256px for an ordinary display and 384px for a retina
 * one — twenty kilobytes or so per photograph, against the five megabytes the
 * original weighs.
 *
 * **Given as `width`/`height` rather than as `sizes`, and that is not a
 * stylistic choice.** A `sizes` string makes `next/image` emit a `w`-descriptor
 * srcset with every candidate width it knows — nine URLs, each carrying a whole
 * presigned URL of some seven hundred characters, per photograph. On an album of
 * 150 that is megabytes of markup before a single image is fetched. Two
 * `x`-descriptor candidates say the same thing about a fixed-size tile.
 *
 * The numbers are not the photograph's aspect ratio — a commission row stores
 * no dimensions, and the artist's uploads are portrait and landscape both. They
 * are the tile's, which is a square; the stylesheet gives the image both of its
 * dimensions and crops with `object-fit: cover`, so the intrinsic ratio decides
 * nothing here. The optimiser keeps each photo's real ratio in the file it
 * returns, which is what lets the same file stand in as the viewer's
 * placeholder.
 */
const TILE_PIXELS = 192

/**
 * One small copy of a photograph, from whichever of the two sources this row
 * has.
 *
 * Both branches paint into a box the stylesheet has already sized — a square
 * tile, or the viewer's frame — so neither needs intrinsic dimensions to avoid
 * a layout shift, and the `width`/`height` on the fallback are the optimiser's
 * instructions rather than the layout's.
 *
 * `loading="lazy"` is what makes a 220-photo album cost only the screenful
 * someone is actually looking at; `next/image` does the same by default on the
 * other branch.
 */
function CommissionPreview({
  alt,
  className,
  decorative,
  image,
}: {
  alt: string
  className: string
  /**
   * Hidden from assistive technology, for the viewer's copy: it is not the
   * photograph as far as a screen reader is concerned, and the original
   * underneath it carries the name.
   */
  decorative?: boolean
  image: CommissionGalleryImage
}) {
  if (image.thumbUrl) {
    return (
      // A plain `img`, because the file is already the size it will be drawn
      // at — putting it through the optimiser would be a round trip through
      // this server to hand back the bytes it was given.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={alt}
        aria-hidden={decorative ? 'true' : undefined}
        className={className}
        decoding="async"
        loading="lazy"
        src={image.thumbUrl}
      />
    )
  }

  return (
    <Image
      alt={alt}
      aria-hidden={decorative ? 'true' : undefined}
      className={className}
      height={TILE_PIXELS}
      src={image.url}
      width={TILE_PIXELS}
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
              <CommissionPreview alt={photo.name} className="gallery__image" image={photo} />
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
            <div className="viewer__frame">
              {/*
               * The placeholder, and deliberately the *same* request the grid
               * has already made: identical `src`, so the browser serves it
               * from cache and the viewer has something on screen in the frame
               * the click happened in. Asking for a larger copy here would be a
               * fresh download to cover a gap measured in hundreds of
               * milliseconds.
               *
               * Stretched far past its own size, which is exactly what a
               * placeholder is: soft for the moment it takes the original to
               * arrive over the top of it. Both sources keep the photograph's
               * own aspect ratio, so it lands in the frame at the shape the
               * real picture is about to occupy.
               */}
              <CommissionPreview alt="" className="viewer__preview" decorative image={image} />

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
