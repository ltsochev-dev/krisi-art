/**
 * Testimonial body presentation.
 *
 * The bodies come out of a plain `textarea`, and there is no length cap on the
 * field — a client wrote 1,000+ characters and stretched every card in the
 * carousel to match, since the track is a flex row of equal-height cards. So
 * long bodies are clipped in the card and moved into a modal.
 *
 * The clip is two separate decisions, deliberately:
 *
 * - **Whether** to clip is a character count, so it is stable across viewports
 *   and testable without a DOM.
 * - **Where** the text visually cuts is CSS (a `max-height` on the quote), so
 *   the full body stays in the server-rendered HTML for crawlers rather than
 *   being truncated out of it. Nothing is hidden from a reader that a search
 *   engine cannot also see.
 */

/**
 * Bodies longer than this get the fade and the "Read more" affordance.
 *
 * Chosen to sit just past the height the CSS clip allows, so a body that clears
 * the threshold is always visibly cut — a card offering "Read more" with no
 * text hidden behind it would read as broken.
 */
export const TESTIMONIAL_CLIP_LIMIT = 280

/** Blank lines separate paragraphs, same convention as the about body. */
export const toParagraphs = (text: string): string[] =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

/**
 * Whether a body is long enough to need the modal.
 *
 * Measured on the trimmed text so trailing newlines out of the textarea cannot
 * push a short quote over the line.
 */
export const isClipped = (text: string, limit = TESTIMONIAL_CLIP_LIMIT): boolean =>
  text.trim().length > limit
