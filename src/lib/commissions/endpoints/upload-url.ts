/**
 * `POST /api/commissions/:id/upload-url` — editors only.
 *
 * Hands back a presigned `PUT` so the browser uploads straight to S3 and the
 * bytes never transit this VPS. Nothing is written to the document here: the
 * row appears only once the object is confirmed to exist, which is what
 * `./register-file.ts` is for.
 */
import type { Endpoint } from 'payload'

import { addDataAndFileToRequest, APIError } from 'payload'

import { getCommissionsBucket, getPresignedUploadUrl } from '@/lib/aws/s3'
import {
  isAllowedCommissionMimeType,
  MAX_COMMISSION_FILE_BYTES,
  UPLOAD_URL_TTL_SECONDS,
} from '@/lib/commissions/constants'
import { buildCommissionKey } from '@/lib/commissions/keys'

import { documentId, guardEditor, storageUnavailable } from './shared'

export const uploadUrlEndpoint: Endpoint = {
  path: '/:id/upload-url',
  method: 'post',
  handler: async (req) => {
    guardEditor(req)

    const unavailable = storageUnavailable()

    if (unavailable) {
      return unavailable
    }

    await addDataAndFileToRequest(req)

    const { contentType, filename, size } = (req.data ?? {}) as {
      contentType?: unknown
      filename?: unknown
      size?: unknown
    }

    if (typeof filename !== 'string' || !filename.trim()) {
      throw new APIError('A filename is required.', 400)
    }

    /**
     * The allowlist is worth something precisely because the URL below signs
     * `ContentType`: S3 itself rejects a `PUT` whose header differs from the
     * one that was signed, so a caller cannot ask for a JPEG URL and push an
     * executable through it.
     */
    if (!isAllowedCommissionMimeType(contentType)) {
      throw new APIError(
        `Files of type ${typeof contentType === 'string' ? contentType : 'unknown'} cannot be delivered through a commission.`,
        400,
      )
    }

    /**
     * Advisory only — a presigned `PUT` cannot enforce a content length, so a
     * client that lies here still gets a URL. The real check is against the
     * size S3 reports back in `./register-file.ts`; this one exists to fail
     * fast before 500MB go over the wire.
     */
    if (typeof size === 'number' && size > MAX_COMMISSION_FILE_BYTES) {
      throw new APIError(
        `That file is larger than the ${Math.round(MAX_COMMISSION_FILE_BYTES / (1024 * 1024))}MB limit.`,
        400,
      )
    }

    const commission = await req.payload
      .findByID({
        collection: 'commissions',
        id: documentId(req),
        depth: 0,
        joins: false,
        overrideAccess: true,
        req,
      })
      .catch(() => null)

    if (!commission?.uuid) {
      throw new APIError('No such commission.', 404)
    }

    const fileId = crypto.randomUUID()
    const key = buildCommissionKey({ commissionUuid: commission.uuid, fileId, filename })

    return Response.json({
      fileId,
      key,
      /**
       * `getCommissionsBucket()` is passed explicitly rather than relying on
       * the helper's default, which is the *media* bucket — the one with a CDN
       * in front of it. A commission key must never be signed against it.
       */
      url: await getPresignedUploadUrl({
        bucket: getCommissionsBucket(),
        contentType,
        expiresIn: UPLOAD_URL_TTL_SECONDS(),
        key,
      }),
    })
  },
}
