/**
 * Turning a commission's stored files into a photo grid.
 *
 * The one place a commission object is addressed for *display* rather than for
 * download, and the differences from `./endpoints/download` are all deliberate:
 *
 * - **The URLs are signed during the page render**, not fetched per click. A
 *   grid of a hundred and fifty pictures cannot make a hundred and fifty round
 *   trips to an endpoint before it can paint, and signing is a local HMAC — no
 *   network, no S3 call — so doing it inline costs nothing worth measuring.
 * - **They are `inline`**, so the browser paints the image instead of saving it.
 * - **They are pinned to a time window**, so the same photo gets the same URL
 *   across page loads — which is what lets the browser cache hold a photograph
 *   and, more importantly, what lets this app's image optimiser hold the resized
 *   copy it made from one. See `GALLERY_URL_WINDOW_SECONDS`.
 *
 * What these URLs address is always the **original**, at whatever size it came
 * off the camera; there are no resized objects in the bucket and nothing here
 * writes one. The grid gets its small copies by handing these URLs to
 * `next/image`, which resizes on the way past and caches the result on disk —
 * see `@/components/commission/CommissionGallery`. That is why the change cost
 * nothing at the storage layer and applies to albums uploaded long before it.
 *
 * What has *not* changed is the part that matters: these are still presigned
 * URLs against a bucket with public access blocked and no CDN. A signed URL is
 * a bearer token for one object for one window, and nothing here ever puts an
 * S3 key in front of the browser.
 *
 * Note the consequence of inline URLs for the access log: a visitor who
 * right-clicks and saves a photo is reading a URL the page already handed them,
 * so it is not recorded as a download. (Out of the grid they now save the
 * optimiser's small copy rather than the photograph, which is what the page's
 * footnote warns about.) The viewer's own download button goes through the
 * endpoint and is recorded. That is the honest trade for a page whose whole
 * job is showing pictures, and it is why the view counter, not the download
 * counter, is the meaningful number on a gallery.
 */
import type { Commission } from '@/payload-types'
import type { PublicCommissionFile } from '@/lib/content/commissions'

import { getCommissionsBucket, getPresignedDownloadUrl, hasCommissionsBucket } from '@/lib/aws/s3'
import { toPublicCommissionFile } from '@/lib/content/commissions'

import { GALLERY_URL_WINDOW_SECONDS, isDisplayableImage } from './constants'
import { contentDispositionInline } from './request'

/** A file the grid can draw, with the URL to draw it from. */
export type CommissionGalleryImage = { url: string } & PublicCommissionFile

export type CommissionGallery = {
  /** Everything the browser cannot paint: archives, PDFs, HEICs, TIFFs. */
  files: PublicCommissionFile[]
  images: CommissionGalleryImage[]
}

/**
 * The start of the window `now` falls in.
 *
 * Flooring against the epoch rather than against anything per-request is what
 * makes two renders a minute apart agree, which is the entire point — a value
 * derived from the request would defeat the caching this exists for.
 */
export const galleryWindowStart = (now: Date, windowSeconds: number): Date =>
  new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000)

/**
 * Splits a commission's files into pictures and everything else, signing a
 * viewing URL for each picture.
 *
 * With no bucket configured every row comes back under `files`, so a checkout
 * with no AWS environment renders an honest download list instead of a grid of
 * broken images — the same courtesy `storageUnavailable` does for the endpoints.
 */
export const buildCommissionGallery = async ({
  commission,
  now = new Date(),
}: {
  commission: Commission
  now?: Date
}): Promise<CommissionGallery> => {
  const rows = (commission.files ?? []).filter((file) => Boolean(file.fileId))

  if (!hasCommissionsBucket()) {
    return { files: rows.map(toPublicCommissionFile), images: [] }
  }

  const bucket = getCommissionsBucket()
  const windowSeconds = GALLERY_URL_WINDOW_SECONDS()
  const signingDate = galleryWindowStart(now, windowSeconds)

  const files: PublicCommissionFile[] = []
  const signing: Promise<CommissionGalleryImage>[] = []

  for (const row of rows) {
    const file = toPublicCommissionFile(row)

    if (!isDisplayableImage(row.mimeType)) {
      files.push(file)
      continue
    }

    signing.push(
      getPresignedDownloadUrl({
        // Explicit, never the helper's default — that one is the media bucket,
        // which is public through a CDN. A commission key must not be signed
        // against it.
        bucket,
        /**
         * Two windows, because the signature is dated to the *start* of the
         * current one: a URL minted in its closing seconds would otherwise
         * arrive at the browser already spent.
         */
        expiresIn: windowSeconds * 2,
        key: row.key,
        responseContentDisposition: contentDispositionInline(file.name),
        responseContentType: row.mimeType ?? undefined,
        signingDate,
      }).then((url) => ({ ...file, url })),
    )
  }

  return { files, images: await Promise.all(signing) }
}
