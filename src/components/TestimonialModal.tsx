'use client'

/**
 * Full text of one testimonial, for the bodies the carousel card clips.
 *
 * Same shape as `Lightbox`: the parent owns the open state (null is closed) so
 * one modal instance serves every card instead of one per card, and the
 * backdrop click / Escape / scroll-lock behaviour is deliberately identical to
 * the gallery viewer so the two read as the same component family.
 *
 * This is an enhancement, not the source of truth. The card already renders the
 * whole body — the clip is CSS — so a crawler, or a reader with JavaScript off,
 * loses the nicer presentation and nothing else.
 */
import { useEffect, useRef } from 'react'

import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'

import { toParagraphs } from '@/lib/content/testimonials'

interface Props {
  body?: string
  name?: string
  onClose: () => void
  open: boolean
}

const TestimonialModal = ({ body, name, onClose, open }: Props) => {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    // The card that opened this, so focus goes back to it on close rather than
    // to the top of the document.
    const opener = document.activeElement as HTMLElement | null

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    panel.current?.focus()

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [onClose, open])

  return (
    <AnimatePresence>
      {open && body ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/95 p-4 backdrop-blur-md md:p-10"
        >
          <motion.div
            ref={panel}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            // The panel is the scroll container, so a very long quote scrolls
            // inside the dialog instead of overflowing the viewport.
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={name ? `Testimonial from ${name}` : 'Testimonial'}
            tabIndex={-1}
            className="max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-8 focus-visible:outline-none md:p-10"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="float-right -mt-2 -mr-2 rounded-full border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <X size={18} aria-hidden="true" />
            </button>

            <figure>
              <blockquote className="font-sans text-muted-foreground">
                {toParagraphs(body).map((paragraph, index) => (
                  <p key={index} className="mb-4 last:mb-0">
                    {paragraph}
                  </p>
                ))}
              </blockquote>

              <figcaption className="mt-6 border-t border-border pt-4 font-sans text-sm tracking-widest text-foreground uppercase">
                {name}
              </figcaption>
            </figure>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default TestimonialModal
