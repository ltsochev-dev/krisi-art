/**
 * Carousel snap geometry.
 *
 * Pure arithmetic, so like `seo.int.spec.ts` this boots no Payload instance.
 *
 * The fixture is the real testimonial track: cards at 31% of a 1200px viewport
 * with a 24px gap, which is a 396px stride, and a scroll range that ends 36px
 * short of the fourth card's start. That last detail is the whole bug — six
 * testimonials used to leave the sixth unreachable from the arrows.
 */
import { describe, expect, it } from 'vitest'

import { snapStops } from '@/lib/ui/carousel'

const STRIDE = 396

/** Slide starts relative to the first slide. */
const offsets = (count: number) => Array.from({ length: count }, (_, index) => index * STRIDE)

/** `scrollWidth - clientWidth` for `count` cards in a 1200px track. */
const maxScroll = (count: number) => count * 372 + (count - 1) * 24 + 48 - 1200

describe('snapStops', () => {
  it('returns nothing when the track does not overflow', () => {
    expect(snapStops(offsets(3), 0)).toEqual([])
    expect(snapStops(offsets(3), 0.4)).toEqual([])
  })

  it('ends on the end of the track, so the last slide is reachable', () => {
    const end = maxScroll(6)
    const stops = snapStops(offsets(6), end)

    expect(stops.at(-1)).toBe(end)
  })

  it('collapses the slides past the end of the range into one final stop', () => {
    // Starts are 0, 396, 792, 1188, 1584, 1980 against a 1200 scroll range. The
    // last two are unreachable and 1188 is 12px short of the end, so all three
    // give way to a single stop on the end itself.
    expect(snapStops(offsets(6), 1200)).toEqual([0, 396, 792, 1200])
  })

  it('keeps a stop that sits a useful distance short of the end', () => {
    // Same six slides, but the range now ends far enough past 792 for that stop
    // to be worth its own control.
    expect(snapStops(offsets(6), 1000)).toEqual([0, 396, 792, 1000])
  })

  it('keeps one stop per slide while every start is reachable', () => {
    expect(snapStops(offsets(4), 1188)).toEqual([0, 396, 792, 1188])
  })

  it('appends the end of the track when no start reaches it', () => {
    // One slide wider than the visible track: its start is 0 and there is
    // nothing else to clamp, so the remainder would otherwise be unreachable.
    expect(snapStops([0], 300)).toEqual([0, 300])
  })

  it('merges positions closer together than a quarter of the slide pitch', () => {
    // A stray half-pixel start between two real ones is the same stop.
    expect(snapStops([0, 0.4, 396, 792], 792)).toEqual([0, 396, 792])
  })

  it('hides the controls behind a single stop when the overflow is trivial', () => {
    // 30px of slack is not worth an arrow, so there is one stop and the caller
    // renders no controls.
    expect(snapStops(offsets(3), 30)).toEqual([30])
  })
})
