/**
 * The numbers the commission feature is built around.
 *
 * The two TTLs are overridable by environment because they are the one thing
 * here that is a judgement call rather than a fact: a client on a slow
 * connection may need longer to finish a `PUT`, and how long a download link
 * should stay live after it is handed out depends on how the artist works. The
 * defaults are the brief's.
 *
 * Read on every call rather than cached at module load, so a value changed in
 * the deployed environment takes effect on restart without a rebuild — and so
 * the integration tests can set them per case.
 */

/** Parses a positive-integer env var, falling back on anything unusable. */
const seconds = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name]?.trim() ?? '', 10)

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * How long a download URL stays valid.
 *
 * Short on purpose. The URL is handed to the browser as JSON and then navigated
 * to immediately, so it only has to survive one click — and a link that leaks
 * out of a browser history or a screen share stops working within minutes.
 */
export const DOWNLOAD_URL_TTL_SECONDS = (): number =>
  seconds('COMMISSION_DOWNLOAD_TTL_SECONDS', 300)

/** How long the artist has to finish a single upload once the URL is issued. */
export const UPLOAD_URL_TTL_SECONDS = (): number => seconds('COMMISSION_UPLOAD_TTL_SECONDS', 900)

/**
 * Hard ceiling per file.
 *
 * Above this the upload wants multipart, which is deliberately out of scope —
 * see the plan. Enforced twice: advisory in the URL-issuing endpoint (a
 * presigned PUT cannot cap content length) and for real against the size S3
 * reports back after the fact.
 */
export const MAX_COMMISSION_FILE_BYTES = 500 * 1024 * 1024

/**
 * What may be uploaded: finished artwork, and archives of it.
 *
 * An allowlist rather than a denylist, and meaningful because the presigned URL
 * signs the `Content-Type` — S3 itself rejects a `PUT` whose header differs
 * from the one that was signed, so a caller cannot request a JPEG URL and push
 * an executable through it.
 *
 * The archive types are listed with every alias browsers are known to send;
 * `application/x-zip-compressed` in particular is what Windows Chrome reports
 * for a `.zip`.
 */
export const ALLOWED_COMMISSION_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/tiff',
  'image/heic',
  'image/heif',
  'image/svg+xml',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
] as const

export const isAllowedCommissionMimeType = (value: unknown): value is string =>
  typeof value === 'string' &&
  (ALLOWED_COMMISSION_MIME_TYPES as readonly string[]).includes(value.trim().toLowerCase())

/**
 * The window a gallery image's URL is signed against.
 *
 * Gallery images are *displayed*, not clicked, so unlike `DOWNLOAD_URL_TTL_SECONDS`
 * this one cannot be short: the URLs are rendered into the page, and a tab left
 * open over lunch must still show pictures when it comes back.
 *
 * It is a **window** rather than a plain TTL because the signature is pinned to
 * the start of it (see `galleryWindowStart`). Within one window every render of
 * the page produces byte-identical URLs, and two things downstream depend on
 * that:
 *
 * - a visitor's browser cache hits on the second visit rather than re-fetching
 *   every photograph;
 * - **this app's image optimiser caches on the `src` it was given.** The grid
 *   draws its tiles through `next/image`, so a URL that changed per request
 *   would have the server re-download and re-encode 150 originals on every page
 *   load — the exact work the optimiser exists to do once.
 *
 * Twelve hours, rather than the three this shipped with, for the second reason:
 * the optimised copies survive only until the URL under them rotates, so a short
 * window is a standing bill in S3 egress and CPU for no benefit to anyone.
 * The cost of the longer one is that a signed URL that leaks — out of a shared
 * screen, a browser history — stays good for a day rather than a quarter of one,
 * on a page whose protection is an unguessable link to begin with.
 *
 * The URLs are signed to live for *two* windows, so one minted at the very end
 * of a window is still good for a window afterwards rather than expiring in the
 * visitor's hands.
 */
export const GALLERY_URL_WINDOW_SECONDS = (): number =>
  // Clamped, because the URLs are signed to last two windows and SigV4 refuses
  // an expiry beyond seven days — an override of, say, a fortnight would
  // otherwise turn every gallery into a signing error rather than a long-lived
  // link.
  Math.min(seconds('COMMISSION_GALLERY_WINDOW_SECONDS', 12 * 60 * 60), 3 * 24 * 60 * 60)

/**
 * What a browser will actually paint from a presigned URL.
 *
 * A subset of `ALLOWED_COMMISSION_MIME_TYPES`, and the omissions are the point:
 * TIFF, HEIC and HEIF are all uploadable and none of them renders in Chrome or
 * Firefox. A gallery commission puts anything not listed here in the file list
 * underneath the grid instead, where it is a download rather than a broken
 * image. That is the honest answer for an iPhone album shared straight out of
 * Photos, which is HEIC unless the phone was asked for "Most Compatible".
 *
 * SVG is left out for a different reason: it is a document that can carry
 * script, and nothing in a photo album has any business being one.
 */
export const DISPLAYABLE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const

export const isDisplayableImage = (value: unknown): value is string =>
  typeof value === 'string' &&
  (DISPLAYABLE_IMAGE_MIME_TYPES as readonly string[]).includes(value.trim().toLowerCase())
