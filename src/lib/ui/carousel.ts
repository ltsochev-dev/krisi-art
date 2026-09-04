/**
 * Snap geometry for a scroll-snap carousel track.
 *
 * Pulled out of the component because it is arithmetic over numbers with one
 * invariant worth pinning down in a test: the last stop is always the end of
 * the track. A carousel whose controls stop short leaves its final slide
 * reachable only by dragging the track — and on a mouse-only machine, with the
 * scrollbar hidden, not reachable at all.
 */

/**
 * Two positions closer together than this fraction of the slide pitch show the
 * same thing, so they count as one stop.
 *
 * This is what keeps a redundant control off the end of the list: the scroll
 * range usually ends a few pixels past the second-to-last slide's start, and a
 * dot that moves the track 12px is noise.
 */
const MERGE_RATIO = 0.25

/**
 * The `scrollLeft` values a track's controls should step through, ascending.
 *
 * `offsets` are the slide start positions relative to the first slide, and
 * `maxScroll` is `scrollWidth - clientWidth`. A slide start at or past the end
 * of the scroll range is not a position the track can rest at, so the end of
 * the track stands in for all of them as a single final stop showing the tail
 * of the list.
 *
 * Returns nothing at all when the track does not overflow, which is the signal
 * to hide the controls entirely.
 */
export const snapStops = (offsets: number[], maxScroll: number): number[] => {
  if (maxScroll < 1) {
    return []
  }

  // Measured off the first two slides: the track's slides are all one width, so
  // the pitch is uniform. 1px is the floor, for a single-slide track that has
  // no pitch to measure.
  const pitch = offsets.length > 1 ? offsets[1] - offsets[0] : 0
  const merge = Math.max(pitch * MERGE_RATIO, 1)

  const stops: number[] = []

  for (const offset of offsets) {
    if (offset >= maxScroll) {
      break
    }

    const previous = stops.at(-1)
    if (previous === undefined || offset - previous > merge) {
      stops.push(offset)
    }
  }

  // The end of the track is always the final stop, and it displaces any stop
  // too close behind it to be a distinct view.
  while (stops.length > 0 && maxScroll - stops[stops.length - 1] <= merge) {
    stops.pop()
  }

  stops.push(maxScroll)

  return stops
}
