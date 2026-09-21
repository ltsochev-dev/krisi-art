/**
 * The small copies a gallery's grid actually draws.
 *
 * **Why these exist at all**, because the arrangement they replace was not
 * obviously wrong: the grid used to hand `next/image` the presigned URL of each
 * original and let this app's image optimiser resize it on the way past. That
 * works, and on a 220-photo album on a small VPS it fails in a way no
 * configuration can fix. Every tile becomes a `/_next/image` request; each one
 * makes the server pull a 5–20MB original out of S3; and the optimiser's
 * upstream fetch is wrapped in a hardcoded, non-configurable
 * `AbortSignal.timeout(7000)` (`next/dist/server/image-optimizer.js`). Served
 * one at a time each download is well inside that. Served all at once — which
 * is what a browser does over HTTP/2, where there is no six-connection limit to
 * save us — they share one pipe, every one of them crosses seven seconds, and
 * the album comes back as a grid of 504s. Failures are not cached, so a reload
 * reproduces it exactly. `imgOptTimeoutInSeconds` does not help: it bounds the
 * sharp pipeline, not the fetch.
 *
 * So the resize happens **once, when the file is registered**, and the result is
 * stored next to the original in the bucket. A tile is then a presigned `GET`
 * of a twenty-kilobyte object, straight from S3 to the browser, and this server
 * is not in the path at all. Nothing to time out, nothing to re-encode when a
 * signing window rotates, no optimiser cache to keep warm, and an album of any
 * size costs S3 what any other static object costs.
 *
 * The originals are untouched: nothing here ever writes to a file's own key,
 * and `buildCommissionThumbnailKey` explains why that is impossible rather than
 * merely avoided. The viewer still shows the original, and Download original
 * still delivers the file the artist uploaded.
 */
import sharp from 'sharp'

import { getObjectBuffer, putObject } from '@/lib/aws/s3'

import { isDisplayableImage } from './constants'
import { buildCommissionThumbnailKey } from './keys'

/**
 * The longest edge of a stored preview.
 *
 * The tile it fills is around 150–192 CSS pixels on a wide monitor and about
 * half the viewport on a phone, so 512 covers a 2× laptop and a 3× phone with
 * room to spare, at twenty-odd kilobytes a photograph. Larger would be a bigger
 * album to download for no visible gain; smaller starts to show, because the
 * viewer stretches this same file across the screen while the original loads.
 */
export const THUMBNAIL_PIXELS = 512

export const THUMBNAIL_CONTENT_TYPE = 'image/webp'

/**
 * The largest original this will read into memory to resize.
 *
 * A commission accepts files up to `MAX_COMMISSION_FILE_BYTES` (500MB), and
 * `getObjectBuffer` would dutifully load every byte of one onto the heap of a
 * container with a couple of gigabytes to its name. Eighty megabytes is far
 * above any photograph a camera produces and far below anything that threatens
 * the process. Over it, the row simply keeps no preview and the grid falls back
 * to the optimiser for that one photo.
 */
export const MAX_THUMBNAIL_SOURCE_BYTES = 80 * 1024 * 1024

/**
 * Resizes one image's bytes into a preview.
 *
 * Four decisions worth naming:
 *
 * - **`rotate()` with no argument** applies the EXIF orientation and drops the
 *   tag, which is the difference between a phone's portrait photographs
 *   appearing upright in the grid and appearing on their side. The browser
 *   would have honoured the tag itself on the original; a resized copy has to
 *   have it baked in.
 * - **`fit: 'inside'`, so the aspect ratio survives.** The grid crops to a
 *   square in CSS (`object-fit: cover`), but the *viewer* lays this same file
 *   into the photo's frame with `object-fit: contain` while the original
 *   arrives — a pre-cropped square would jump the moment the real photograph
 *   faded in over it.
 * - **`withoutEnlargement`**, so an image already smaller than the tile is
 *   re-encoded rather than upscaled into a blurry larger file.
 * - **No `withMetadata()`**, so sharp's default applies and EXIF is left
 *   behind. The preview is the file that gets handed around in a browser, and
 *   it has no business carrying the GPS coordinates of someone's house. The
 *   original keeps its metadata, exactly as uploaded.
 */
export const createThumbnail = async (source: Buffer): Promise<Buffer> =>
  await sharp(source, { sequentialRead: true })
    .rotate()
    .resize(THUMBNAIL_PIXELS, THUMBNAIL_PIXELS, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer()

/**
 * Reads an original out of the bucket, resizes it, and writes the preview back
 * beside it. Returns the key the preview was stored under.
 *
 * The long `Cache-Control` is for the browser, not for S3: the URL this object
 * is served through is presigned and pinned to a window
 * (`GALLERY_URL_WINDOW_SECONDS`), so a revisit inside that window asks for a
 * byte-identical URL and can be answered from disk. The object itself never
 * changes — a different photograph is a different `fileId` and therefore a
 * different key — so there is nothing for a stale cache entry to get wrong.
 */
export const generateCommissionThumbnail = async ({
  bucket,
  commissionUuid,
  fileId,
  key,
}: {
  bucket: string
  commissionUuid: string
  fileId: string
  key: string
}): Promise<string> => {
  const thumbKey = buildCommissionThumbnailKey({ commissionUuid, fileId })
  const preview = await createThumbnail(await getObjectBuffer({ bucket, key }))

  await putObject({
    body: preview,
    bucket,
    cacheControl: 'public, max-age=31536000, immutable',
    contentType: THUMBNAIL_CONTENT_TYPE,
    key: thumbKey,
  })

  return thumbKey
}

/**
 * Whether a stored row is one this can make a preview for.
 *
 * The two reasons it might not be are unrelated: a file a browser cannot paint
 * has nothing to preview (`isDisplayableImage` is the same list the grid uses),
 * and one too large to read is refused on the grounds above. A row that already
 * has a `thumbKey` is *not* excluded here — regenerating over an existing
 * preview is safe and is what a retry does.
 */
export const canThumbnail = ({
  filesize,
  mimeType,
}: {
  filesize?: null | number
  mimeType?: null | string
}): boolean =>
  isDisplayableImage(mimeType) &&
  (typeof filesize !== 'number' || filesize <= MAX_THUMBNAIL_SOURCE_BYTES)
