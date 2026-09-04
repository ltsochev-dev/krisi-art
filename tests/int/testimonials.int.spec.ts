/**
 * Testimonial body presentation.
 *
 * Pure functions, so like `seo.int.spec.ts` this boots no Payload instance.
 */
import { describe, expect, it } from 'vitest'

import { TESTIMONIAL_CLIP_LIMIT, isClipped, toParagraphs } from '@/lib/content/testimonials'

const body = (length: number) => 'x'.repeat(length)

describe('toParagraphs', () => {
  it('splits on blank lines', () => {
    expect(toParagraphs('One.\n\nTwo.\n\n\nThree.')).toEqual(['One.', 'Two.', 'Three.'])
  })

  it('keeps single newlines inside a paragraph', () => {
    expect(toParagraphs('One.\nStill one.')).toEqual(['One.\nStill one.'])
  })

  it('drops whitespace-only paragraphs and trims the rest', () => {
    expect(toParagraphs('  One.  \n\n   \n\n  Two.')).toEqual(['One.', 'Two.'])
  })

  it('returns nothing for an empty body', () => {
    expect(toParagraphs('')).toEqual([])
    expect(toParagraphs('\n\n  \n')).toEqual([])
  })
})

describe('isClipped', () => {
  it('leaves a body at the limit alone', () => {
    expect(isClipped(body(TESTIMONIAL_CLIP_LIMIT))).toBe(false)
  })

  it('clips one character past the limit', () => {
    expect(isClipped(body(TESTIMONIAL_CLIP_LIMIT + 1))).toBe(true)
  })

  it('measures the trimmed body, so trailing newlines cannot trip it', () => {
    expect(isClipped(`${body(TESTIMONIAL_CLIP_LIMIT)}\n\n   `)).toBe(false)
  })

  it('clips the 1,024-character body that stretched the carousel', () => {
    expect(isClipped(body(1024))).toBe(true)
  })
})
