'use client'

/**
 * Full-screen viewer for a gallery grid.
 *
 * Renders the `hero` derivative (1920px webp) rather than the original upload:
 * the originals here run to 20MB+, and every byte is streamed through
 * `/api/media/file/...` by the Payload server, so the original would make
 * opening an image measurably expensive. `hero` falls back to the raw `url` only
 * when the derivative is missing — an upload predating the size config.
 *
 * `index` doubles as the open/closed flag: null is closed. The parent owns it so
 * the same lightbox can be driven by the homepage's filtered set or a full album
 * page without either knowing about the other.
 */
import { useCallback, useEffect } from 'react'

import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import posthog from 'posthog-js'

import type { GalleryArtwork } from '@/lib/content/queries'

interface Props {
  artworks: GalleryArtwork[]
  index: null | number
  onClose: () => void
  onIndexChange: (index: number) => void
}

const Lightbox = ({ artworks, index, onClose, onIndexChange }: Props) => {
  const isOpen = index !== null
  const artwork = index === null ? undefined : artworks[index]
  const hasSiblings = artworks.length > 1

  // Wraps at both ends, so arrowing past the last image returns to the first
  // rather than dead-ending on a disabled control.
  const step = useCallback(
    (delta: number) => {
      if (index === null || artworks.length === 0) {
        return
      }

      const nextIndex = (index + delta + artworks.length) % artworks.length
      const nextArtwork = artworks[nextIndex]
      posthog.capture('artwork_lightbox_navigated', {
        direction: delta > 0 ? 'next' : 'prev',
        artwork_id: nextArtwork.id,
        artwork_title: nextArtwork.title,
        album_title: nextArtwork.album.title,
      })
      onIndexChange(nextIndex)
    },
    [artworks, index, onIndexChange],
  )

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
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
  }, [isOpen, onClose, step])

  return (
    <AnimatePresence>
      {artwork && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          // Clicking the backdrop closes; the figure below stops propagation so
          // clicking the image itself does not.
          onClick={onClose}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 p-4 backdrop-blur-md md:p-10"
          role="dialog"
          aria-modal="true"
          aria-label={`${artwork.title} — enlarged`}
        >
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 rounded-full border border-border bg-background/70 p-2 text-muted-foreground transition-colors hover:text-foreground md:top-6 md:right-6"
          >
            <X size={22} />
          </button>

          {hasSiblings && (
            <>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  step(-1)
                }}
                aria-label="Previous image"
                className="absolute left-2 z-10 rounded-full border border-border bg-background/70 p-2 text-muted-foreground transition-colors hover:text-foreground md:left-6 md:p-3"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  step(1)
                }}
                aria-label="Next image"
                className="absolute right-2 z-10 rounded-full border border-border bg-background/70 p-2 text-muted-foreground transition-colors hover:text-foreground md:right-6 md:p-3"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}

          <motion.figure
            // Keyed on the artwork so stepping re-runs the transition rather
            // than swapping the source under a static frame.
            key={artwork.id}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-full max-w-full flex-col items-center gap-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={artwork.image?.sizes.hero ?? artwork.image?.url ?? ''}
              alt={artwork.image?.alt ?? artwork.title}
              className="max-h-[75vh] w-auto max-w-full rounded-lg object-contain"
            />

            <figcaption className="max-w-2xl text-center">
              <h2 className="font-serif text-2xl text-foreground">{artwork.title}</h2>
              <p className="mt-1 font-sans text-xs tracking-widest text-primary uppercase">
                {[artwork.album.title, artwork.year, artwork.medium, artwork.dimensions]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {artwork.description && (
                <p className="mt-3 text-sm text-muted-foreground">{artwork.description}</p>
              )}
              {hasSiblings && (
                <p className="mt-3 font-sans text-xs text-muted-foreground">
                  {(index ?? 0) + 1} / {artworks.length}
                </p>
              )}
            </figcaption>
          </motion.figure>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default Lightbox
