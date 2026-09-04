'use client'

import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import posthog from 'posthog-js'

import type { getTestimonials } from '@/lib/content/queries'

import TestimonialModal from '@/components/TestimonialModal'
import { isClipped, toParagraphs } from '@/lib/content/testimonials'
import { snapStops } from '@/lib/ui/carousel'

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

  /**
   * The `scrollLeft` values the arrows and dots can actually reach, ascending.
   *
   * A list of positions rather than a count of cards, because the two are not
   * the same thing: the last card's own start position sits past the end of the
   * scroll range, so the final stop is the end of the track and shows the whole
   * tail of the list at once. Deriving `active` and the disabled state from this
   * one list is what keeps them in step — measuring stops in cards while
   * tracking `active` in cards-nearest-to-scrollLeft is what previously stranded
   * the last testimonial one click out of reach.
   *
   * A ref, not state: `paint` reads it on every scroll frame.
   */
  const stops = useRef<number[]>([])
  // Mirrors `stops.current.length` for rendering. 0 while everything still fits
  // on screen, which is what hides the controls entirely.
  const [stopCount, setStopCount] = useState(0)

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

    const centre = track.scrollLeft + track.clientWidth / 2
    const reduced = prefersReducedMotion()

    let nearest = 0
    let nearestGap = Infinity

    stops.current.forEach((position, index) => {
      const gap = Math.abs(position - track.scrollLeft)
      if (gap < nearestGap) {
        nearestGap = gap
        nearest = index
      }
    })

    cardRefs.current.forEach((card) => {
      if (!card || reduced) return

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

  /** Rebuild the reachable scroll positions. */
  const measure = useCallback(() => {
    const track = trackRef.current
    const first = cardRefs.current[0]
    if (!track || !first) return

    const positions = snapStops(
      cardRefs.current.flatMap((card) => (card ? [card.offsetLeft - first.offsetLeft] : [])),
      track.scrollWidth - track.clientWidth,
    )

    stops.current = positions
    setStopCount(positions.length)
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

  const scrollToStop = useCallback((index: number) => {
    const track = trackRef.current
    const position = stops.current[index]
    if (!track || position === undefined) return

    track.scrollTo({
      left: position,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [])

  const step = useCallback(
    (direction: -1 | 1) => {
      scrollToStop(Math.max(0, Math.min(active + direction, stops.current.length - 1)))
    },
    [active, scrollToStop],
  )

  const hasControls = stopCount > 1

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
                  // The last card aligns to the end of the track rather than
                  // the start: under `snap-mandatory` its start position sits
                  // past `maxScroll`, so an end alignment is what makes the
                  // final stop a real snap point instead of one the browser has
                  // to clamp.
                  className={`w-[82%] shrink-0 will-change-transform sm:w-[48%] lg:w-[31%] ${
                    index === testimonials.length - 1 ? 'snap-end' : 'snap-start'
                  }`}
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
                {Array.from({ length: stopCount }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => scrollToStop(index)}
                    // "Position" rather than "testimonial": the stops stop
                    // matching the cards one-for-one as soon as the tail of the
                    // list collapses into the final one.
                    aria-label={`Go to position ${index + 1} of ${stopCount}`}
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
                disabled={active >= stopCount - 1}
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
