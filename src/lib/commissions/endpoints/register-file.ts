/**
 * `POST /api/commissions/:id/files` — editors only.
 *
 * Called by the uploader once a presigned `PUT` has finished. This is where the
 * file becomes real: until a row exists the object is invisible to the artist
 * and unreachable by the client.
 *
 * Nothing the client sends about the *object* is trusted. The key is checked
 * against the commission it claims to belong to, and the size and content type
 * are read back off S3 rather than taken from the request — a presigned `PUT`
 * cannot enforce a content length, so the only honest number is the one S3
 * reports.
 *
 * It is also where a photograph's preview is made, which is the one slow thing
 * this handler does: the original is read back out of the bucket, resized and
 * written beside it before the row is written. That costs a few seconds per
 * photo during an upload session and saves the visitor's browser from asking
 * this server to resize 220 originals on the fly — see
 * `@/lib/commissions/thumbnails` for what that used to do to the page.
 */
import type { Endpoint } from 'payload'

import { addDataAndFileToRequest, APIError } from 'payload'

import { deleteObjects, getCommissionsBucket, headObject } from '@/lib/aws/s3'
import { MAX_COMMISSION_FILE_BYTES } from '@/lib/commissions/constants'
import { isKeyForCommission, sanitiseFilename } from '@/lib/commissions/keys'
import { canThumbnail, generateCommissionThumbnail } from '@/lib/commissions/thumbnails'

import { documentId, guardEditor, storageUnavailable } from './shared'

export const registerCommissionFileEndpoint: Endpoint = {
  path: '/:id/files',
  method: 'post',
  handler: async (req) => {
    guardEditor(req)

    const unavailable = storageUnavailable()

    if (unavailable) {
      return unavailable
    }

    await addDataAndFileToRequest(req)

    const { fileId, key, label } = (req.data ?? {}) as {
      fileId?: unknown
      key?: unknown
      label?: unknown
    }

    if (typeof fileId !== 'string' || !fileId.trim() || typeof key !== 'string' || !key.trim()) {
      throw new APIError('A fileId and a key are required.', 400)
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

    /**
     * Never trust a client-supplied key. Without this, an editor — or anything
     * holding an editor's cookie — could register an object belonging to
     * another commission, or any object anywhere in the bucket, as a file of
     * this one, and the download endpoint would then happily sign a URL for it.
     */
    if (!isKeyForCommission(key, commission.uuid)) {
      throw new APIError('That key does not belong to this commission.', 400)
    }

    if ((commission.files ?? []).some((file) => file.fileId === fileId)) {
      throw new APIError('That file is already registered.', 409)
    }

    const bucket = getCommissionsBucket()
    const head = await headObject({ bucket, key })

    if (!head) {
      // The normal reason to be here is an upload that never finished, or one
      // whose presigned URL expired mid-flight.
      throw new APIError('That file is not in storage. The upload did not complete.', 404)
    }

    if (head.contentLength > MAX_COMMISSION_FILE_BYTES) {
      // Refuse it *and* clean it up: an object nobody can register is an object
      // nobody will ever delete.
      await deleteObjects({ bucket, keys: [key] }).catch((error) => {
        req.payload.logger.error(
          { err: error, key },
          'Could not delete an oversized commission upload; it is now orphaned.',
        )
      })

      throw new APIError(
        `That file is larger than the ${Math.round(MAX_COMMISSION_FILE_BYTES / (1024 * 1024))}MB limit and has been discarded.`,
        400,
      )
    }

    /**
     * The filename comes from the key rather than from the request, so what is
     * stored is exactly what the object is called in the bucket — and it has
     * already been through `sanitiseFilename` on the way in. `sanitiseFilename`
     * is applied again here as a belt-and-braces measure for a key that was
     * built by some earlier version of the uploader.
     */
    const filename = sanitiseFilename(key.split('/').slice(2).join('/'))

    /**
     * Best-effort, and deliberately so: a preview that could not be made must
     * never cost the artist an upload that already succeeded. The row is
     * written either way and the grid falls back to the image optimiser for
     * that one photo, which is what every tile used to do. Pressing Generate
     * previews in the uploader retries it.
     */
    const thumbKey = canThumbnail({ filesize: head.contentLength, mimeType: head.contentType })
      ? await generateCommissionThumbnail({
          bucket,
          commissionUuid: commission.uuid,
          fileId,
          key,
        }).catch((error: unknown) => {
          req.payload.logger.error(
            { err: error, key },
            'Registered a commission file but could not build its preview; the grid will fall back to the image optimiser for it.',
          )

          return null
        })
      : null

    const updated = await req.payload.update({
      collection: 'commissions',
      id,
      data: {
        files: [
          ...(commission.files ?? []),
          {
            downloadCount: 0,
            fileId,
            filename,
            filesize: head.contentLength,
            key,
            label: typeof label === 'string' && label.trim() ? label.trim() : undefined,
            mimeType: head.contentType,
            thumbKey,
            uploadedAt: new Date().toISOString(),
          },
        ],
      },
      depth: 0,
      // The array is server-owned (see `src/collections/Commissions.ts`), so
      // this is the writer it was made server-owned *for*. `req` is threaded
      // through so the write joins the request's transaction.
      overrideAccess: true,
      req,
    })

    return Response.json({ files: updated.files ?? [] })
  },
}
