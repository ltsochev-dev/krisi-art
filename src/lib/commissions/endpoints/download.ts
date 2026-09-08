/**
 * `POST /api/commissions/:uuid/download/:fileId` — public.
 *
 * The only read path to a commission object. The bucket has public access
 * blocked and no CDN, so a presigned URL is the only way in, and this handler
 * is the only thing that issues one.
 *
 * **The URL comes back as JSON rather than as a 302.** The client then
 * navigates to it. That keeps the presigned URL out of the referrer chain and
 * out of any server or proxy log that records redirect targets — a redirect
 * target is the kind of thing that ends up in an access log by default, and
 * this one is a bearer token for the file.
 */
import type { Endpoint } from 'payload'

import { getCommissionsBucket, getPresignedDownloadUrl } from '@/lib/aws/s3'
import { checkRateLimit } from '@/lib/rate-limit'
import { logCommissionAccess } from '@/lib/commissions/access-log'
import { DOWNLOAD_URL_TTL_SECONDS } from '@/lib/commissions/constants'
import { unlockCookieName, verifyUnlockToken } from '@/lib/commissions/password'
import { contentDispositionAttachment, getClientIp, readCookie } from '@/lib/commissions/request'
import { evaluateCommissionGate, findCommissionRecordByUuid } from '@/lib/content/commissions'

import { publicNotFound, routeParam, storageUnavailable, tooManyRequests } from './shared'

/** A client fetching a set of deliverables in one go must not trip this. */
const RATE_LIMIT = { limit: 60, windowMs: 60 * 1000 }

export const downloadCommissionFileEndpoint: Endpoint = {
  path: '/:uuid/download/:fileId',
  method: 'post',
  handler: async (req) => {
    const unavailable = storageUnavailable()

    if (unavailable) {
      return unavailable
    }

    const fileId = routeParam(req, 'fileId')
    const uuid = routeParam(req, 'uuid')

    if (!fileId || !uuid) {
      return publicNotFound()
    }

    const rateLimit = checkRateLimit({
      key: `commission-download:${getClientIp(req.headers)}`,
      ...RATE_LIMIT,
    })

    if (!rateLimit.allowed) {
      return tooManyRequests(rateLimit.retryAfter)
    }

    const commission = await findCommissionRecordByUuid({ payload: req.payload, req, uuid })

    if (!commission) {
      return publicNotFound()
    }

    const gate = evaluateCommissionGate(commission)

    if (!gate.ok) {
      await logCommissionAccess({
        commissionId: commission.id,
        event: 'denied',
        headers: req.headers,
        payload: req.payload,
        reason: gate.reason,
        req,
      })

      return publicNotFound()
    }

    /**
     * The password gate, when there is one.
     *
     * The cookie is read from the raw header rather than through
     * `next/headers`, because a Payload endpoint handler is not inside a Next
     * request scope. `verifyUnlockToken` re-checks the UUID against the token's
     * own claim — the cookie is path-scoped, but a caller can send any cookie
     * it likes to any path, so the token has to say which commission it unlocks.
     *
     * A 401 here, not a 404: the caller already proved they hold the UUID by
     * getting the page, so there is nothing left to conceal, and the component
     * needs to be able to tell "wrong link" from "session expired, ask again".
     */
    if (commission.passwordHash) {
      const token = readCookie(req.headers.get('cookie'), unlockCookieName(uuid))

      if (!(await verifyUnlockToken(token, uuid))) {
        await logCommissionAccess({
          commissionId: commission.id,
          event: 'denied',
          headers: req.headers,
          payload: req.payload,
          reason: 'no-password',
          req,
        })

        return Response.json(
          { message: 'This commission is password protected. Please enter the password again.' },
          { status: 401 },
        )
      }
    }

    const files = commission.files ?? []
    const file = files.find((row) => row.fileId === fileId)

    if (!file) {
      return publicNotFound()
    }

    const name = file.label?.trim() || file.filename

    const url = await getPresignedDownloadUrl({
      // Explicit, never the helper's default — that one is the media bucket,
      // which is public through a CDN. A commission key must not be signed
      // against it.
      bucket: getCommissionsBucket(),
      expiresIn: DOWNLOAD_URL_TTL_SECONDS(),
      key: file.key,
      /**
       * Both of these are *signed* parameters, so whoever holds the URL cannot
       * rewrite them. Without the disposition a browser paints a JPEG on screen
       * instead of saving it and the client loses the filename; the RFC 5987
       * encoding in `contentDispositionAttachment` is what makes a Cyrillic name
       * survive the trip.
       */
      responseContentDisposition: contentDispositionAttachment(name),
      responseContentType: file.mimeType ?? undefined,
    })

    await logCommissionAccess({
      commissionId: commission.id,
      event: 'download',
      fileId,
      filename: name,
      headers: req.headers,
      payload: req.payload,
      req,
    })

    await req.payload.update({
      collection: 'commissions',
      id: commission.id,
      data: {
        downloadCount: (commission.downloadCount ?? 0) + 1,
        // The whole array goes back, with one row's counter bumped: Payload
        // array updates replace, they do not merge, so sending only the changed
        // row would delete every other file.
        files: files.map((row) =>
          row.fileId === fileId ? { ...row, downloadCount: (row.downloadCount ?? 0) + 1 } : row,
        ),
        lastAccessedAt: new Date().toISOString(),
      },
      depth: 0,
      overrideAccess: true,
      req,
    })

    return Response.json({ url })
  },
}
