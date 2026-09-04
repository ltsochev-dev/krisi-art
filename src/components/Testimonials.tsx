'use client'

import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import posthog from 'posthog-js'

import type { getTestimonials } from '@/lib/content/queries'

import TestimonialModal from '@/components/TestimonialModal'
import { isClipped, toParagraphs } from '@/lib/content/testimonials'

type TestimonialList = Awaited<ReturnType<typeof getTestimonials>>

interface Props {
  title?: string
  subtitle?: string | null
  testimonials?: TestimonialList
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const Testimonials = ({ title = 'Kind Words', subtitle, testimonials = [] }: Props) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLElement | null)[]>([])
  const frame = useRef<number | null>(null)

  const [active, setActive] = useState(0)
  // Index of the testimonial shown in the modal; null is closed.
  const [expanded, setExpanded] = useState<null | number>(null)
  // Number of reachable snap positions. Smaller than the card count once the
  // last few cards share the final scroll position, and 0 while everything
  // still fits on screen — which is what hides the controls entirely.
  const [stops, setStops] = useState(0)

  /**
   * Scroll-linked card motion. Cards ease down in scale and opacity the further
   * their centre sits from the centre of the viewport, so the focused card
   * reads as the foreground one and the peeking neighbours recede.
   *
   * Written straight to the DOM rather than through state: this runs on every
   * scroll frame, and re-rendering nine cards per frame is a needless cost.
   */
  const paint = useCallback(() => {
    const track = trackRef.current
    if (!track) return

    const first = cardRefs.current[0]
    const origin = first ? first.offsetLeft : 0
    const centre = track.scrollLeft + track.clientWidth / 2
    const reduced = prefersReducedMotion()

    let nearest = 0
    let nearestGap = Infinity

    cardRefs.current.forEach((card, index) => {
      if (!card) return

      const gap = Math.abs(card.offsetLeft - origin - track.scrollLeft)
      if (gap < nearestGap) {
        nearestGap = gap
        nearest = index
      }

      if (reduced) return

      // 0 at dead centre, 1 once a card is a full viewport away.
      const distance = Math.min(
        Math.abs(card.offsetLeft + card.offsetWidth / 2 - centre) / track.clientWidth,
        1,
      )
      card.style.setProperty('--card-scale', String(1 - distance * 0.16))
      card.style.setProperty('--card-fade', String(1 - distance * 0.8))
    })

    setActive((current) => (current === nearest ? current : nearest))
  }, [])

  const handleScroll = useCallback(() => {
    if (frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      paint()
    })
  }, [paint])

  /** Measure how many snap positions the track can actually reach. */
  const measure = useCallback(() => {
    const track = trackRef.current
    const first = cardRefs.current[0]
    if (!track || !first) return

    const maxScroll = track.scrollWidth - track.clientWidth
    if (maxScroll < 1) {
      setStops(0)
      return
    }

    const reachable = cardRefs.current.filter(
      (card) => card && card.offsetLeft - first.offsetLeft <= maxScroll + 1,
    ).length

    setStops(reachable)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    // Drop refs left behind by a shorter list before measuring against them.
    cardRefs.current.length = testimonials.length

    measure()
    paint()

    const observer = new ResizeObserver(() => {
      measure()
      paint()
    })
    observer.observe(track)

    return () => {
      observer.disconnect()
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [measure, paint, testimonials])

  const scrollToCard = useCallback((index: number) => {
    const track = trackRef.current
    const first = cardRefs.current[0]
    const target = cardRefs.current[index]
    if (!track || !first || !target) return

    track.scrollTo({
      left: target.offsetLeft - first.offsetLeft,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [])

  const step = useCallback(
    (direction: -1 | 1) => {
      scrollToCard(Math.max(0, Math.min(active + direction, testimonials.length - 1)))
    },
    [active, scrollToCard, testimonials.length],
  )

  const hasControls = stops > 1

  return (
    <section id="testimonials" className="bg-background py-16 md:py-24">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="mb-4 font-serif text-4xl text-foreground md:text-5xl">{title}</h2>
          <div className="section-divider mb-8" />
          {subtitle ? <p className="mb-4 text-muted-foreground">{subtitle}</p> : null}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mx-auto mt-10 max-w-6xl"
        >
          <div
            ref={trackRef}
            onScroll={handleScroll}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                step(1)
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault()
                step(-1)
              }
            }}
            role="region"
            aria-roledescription="carousel"
            aria-label={title}
            tabIndex={0}
            // The negative margin lets cards run to the edge of the container on
            // small screens while `scroll-px` keeps the snap points inset.
            className="-mx-6 flex snap-x snap-mandatory scroll-px-6 [scrollbar-width:none] gap-6 overflow-x-auto px-6 py-4 focus-visible:outline-none [&::-webkit-scrollbar]:hidden"
          >
            {testimonials.map((testimonial, index) => {
              const clipped = isClipped(testimonial.testimonial)

              return (
                <figure
                  key={testimonial.id}
                  ref={(node) => {
                    cardRefs.current[index] = node
                  }}
                  aria-roledescription="slide"
                  aria-label={`${index + 1} of ${testimonials.length}`}
                  style={{
                    transform: 'scale(var(--card-scale, 1))',
                    opacity: 'var(--card-fade, 1)',
                  }}
                  className="w-[82%] shrink-0 snap-start will-change-transform sm:w-[48%] lg:w-[31%]"
                >
                  <div className="relative flex h-full flex-col rounded-2xl border border-border bg-card p-8 transition-colors duration-300 focus-within:border-primary hover:border-primary">
                    {/* The whole body is rendered whether or not it is clipped —
                      the cut is `max-h` plus a mask, so a long quote costs a
                      crawler nothing. `max-h-44` is a shade over the seven lines
                      `TESTIMONIAL_CLIP_LIMIT` characters occupy, so a body that
                      trips the limit is always visibly cut. */}
                    <blockquote
                      className={`flex-1 font-sans text-muted-foreground ${
                        clipped
                          ? 'max-h-44 overflow-hidden [mask-image:linear-gradient(to_bottom,black_62%,transparent)]'
                          : ''
                      }`}
                    >
                      {/* Plain text out of a textarea, same as the about body: blank
                        lines separate paragraphs. */}
                      {toParagraphs(testimonial.testimonial).map((paragraph, paragraphIndex) => (
                        <p key={paragraphIndex} className="mb-4 last:mb-0">
                          {paragraph}
                        </p>
                      ))}
                    </blockquote>

                    {clipped ? (
                      // Presentational only. The accessible control is the overlay
                      // button below, which covers the card; a real <button> here
                      // would nest one interactive element inside another.
                      <span
                        aria-hidden="true"
                        className="mt-4 self-start font-sans text-xs tracking-widest text-primary uppercase underline decoration-primary/40 underline-offset-4"
                      >
                        Read more
                      </span>
                    ) : null}

                    {/* `testimonial.socials` is deliberately not rendered. The rating
                      is internal-only per its field description, and the social
                      links stay out of the card for now. */}
                    <figcaption className="mt-6 border-t border-border pt-4 font-sans text-sm tracking-widest text-foreground uppercase">
                      {testimonial.name}
                    </figcaption>

                    {clipped ? (
                      <button
                        type="button"
                        onClick={() => {
                          posthog.capture('testimonial_expanded', {
                            testimonial_id: testimonial.id,
                            testimonial_name: testimonial.name,
                          })
                          setExpanded(index)
                        }}
                        aria-label={`Read the full testimonial from ${testimonial.name}`}
                        className="absolute inset-0 cursor-pointer rounded-2xl focus-visible:outline-none"
                      />
                    ) : null}
                  </div>
                </figure>
              )
            })}
          </div>

          {hasControls ? (
            <div className="mt-8 flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={active === 0}
                aria-label="Previous testimonial"
                className="rounded-full border border-border p-2 text-foreground transition-colors duration-300 hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>

              <div className="flex items-center gap-2">
                {Array.from({ length: stops }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => scrollToCard(index)}
                    aria-label={`Go to testimonial ${index + 1}`}
                    aria-current={index === active}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      index === active ? 'w-6 bg-primary' : 'w-1.5 bg-border hover:bg-primary/50'
                    }`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => step(1)}
                disabled={active >= stops - 1}
                aria-label="Next testimonial"
                className="rounded-full border border-border p-2 text-foreground transition-colors duration-300 hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </motion.div>
      </div>

      {/* One instance for the whole carousel rather than one per card. */}
      <TestimonialModal
        body={expanded === null ? undefined : testimonials[expanded]?.testimonial}
        name={expanded === null ? undefined : testimonials[expanded]?.name}
        onClose={() => setExpanded(null)}
        open={expanded !== null}
      />
    </section>
  )
}

export default Testimonials
