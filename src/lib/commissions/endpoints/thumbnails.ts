/**
 * `POST /api/commissions/:id/thumbnails` — editors only.
 *
 * Builds the previews a gallery's grid draws for rows that have none. New
 * uploads get theirs in `./register-file`; this is for the albums that were
 * already in the bucket when previews were introduced, and for retrying a photo
 * whose resize failed at upload.
 *
 * **A batch per call, not the whole album.** Each photo is a multi-megabyte
 * download from S3 and a libvips decode, so 220 of them in one request would sit
 * far past any reverse proxy's patience and lose the work done so far. The
 * uploader calls this in a loop and stops when `remaining` reaches zero — or
 * when a pass generates nothing at all, which is what termination rests on when
 * some photo in the album cannot be resized however many times it is tried.
 *
 * Every failure is reported per file and none of them fails the request: one
 * corrupt JPEG in an album of 220 must not stand between the artist and the
 * other 219 previews.
 */
import type { Endpoint } from 'payload'

import { APIError } from 'payload'

import { getCommissionsBucket } from '@/lib/aws/s3'
import { canThumbnail, generateCommissionThumbnail } from '@/lib/commissions/thumbnails'

import { documentId, guardEditor, storageUnavailable } from './shared'

/**
 * How many photographs one call will do.
 *
 * Sized against the slow case rather than the fast one: a 20MB original off S3
 * and resized on a small VPS is a few seconds, so five is comfortably inside a
 * default 60-second proxy timeout with room for one that is much worse than
 * average.
 */
export const THUMBNAIL_BATCH = 5

export const generateThumbnailsEndpoint: Endpoint = {
  path: '/:id/thumbnails',
  method: 'post',
  handler: async (req) => {
    guardEditor(req)

    const unavailable = storageUnavailable()

    if (unavailable) {
      return unavailable
    }

    const id = documentId(req)

    const commission = await req.payload
      .findByID({
        collection: 'commissions',
        id,
        depth: 0,
        joins: false,
        overrideAccess: true,
        req,
      })
      .catch(() => null)

    if (!commission?.uuid) {
      throw new APIError('No such commission.', 404)
    }

    const files = commission.files ?? []
    const pending = files.filter((file) => !file.thumbKey && canThumbnail(file))
    const batch = pending.slice(0, THUMBNAIL_BATCH)
    const bucket = getCommissionsBucket()

    /** `fileId` → the key its new preview was written to. */
    const made = new Map<string, string>()
    const errors: string[] = []

    // Sequential on purpose. The whole reason these are stored rather than made
    // on demand is that this container cannot resize several photographs at
    // once without falling over; doing it here in parallel would reproduce the
    // failure in the admin panel instead of on the public page.
    for (const file of batch) {
      try {
        made.set(
          file.fileId,
          await generateCommissionThumbnail({
            bucket,
            commissionUuid: commission.uuid,
            fileId: file.fileId,
            key: file.key,
          }),
        )
      } catch (error) {
        req.payload.logger.error(
          { err: error, key: file.key },
          'Could not build the preview for a commission photo.',
        )

        errors.push(
          `${file.filename}: ${error instanceof Error ? error.message : 'the resize failed.'}`,
        )
      }
    }

    /**
     * `remaining` counts only the rows this call did not reach, so a batch of
     * five with two failures reports three done and however many were never
     * tried. The two failures come back round on the next pass — the loop ends
     * when nothing is left to try, or when a whole pass produces nothing.
     */
    const remaining = pending.length - batch.length

    if (made.size === 0) {
      return Response.json({ errors, files, generated: 0, remaining })
    }

    const updated = await req.payload.update({
      collection: 'commissions',
      id,
      data: {
        files: files.map((file) =>
          made.has(file.fileId) ? { ...file, thumbKey: made.get(file.fileId) } : file,
        ),
      },
      depth: 0,
      // The array is server-owned — see `src/collections/Commissions.ts`. This
      // writes one field on rows that already exist and invents none.
      overrideAccess: true,
      req,
    })

    return Response.json({
      errors,
      files: updated.files ?? [],
      generated: made.size,
      remaining,
    })
  },
}
