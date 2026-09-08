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
