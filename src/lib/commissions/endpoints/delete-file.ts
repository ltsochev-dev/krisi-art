/**
 * `DELETE /api/commissions/:id/files/:fileId` — editors only.
 *
 * Order matters, and it is the opposite of what feels tidy: the row goes
 * first, then the object. A failed S3 delete then leaves an orphaned object —
 * a fraction of a cent a month — rather than a row pointing at nothing, which
 * would show the client a file that 404s when they click it. The same trade
 * `deleteCommissionObjects` makes for a whole document.
 */
import type { Endpoint } from 'payload'

import { APIError } from 'payload'

import { deleteObjects, getCommissionsBucket } from '@/lib/aws/s3'

import { documentId, guardEditor, routeParam, storageUnavailable } from './shared'

export const deleteCommissionFileEndpoint: Endpoint = {
  path: '/:id/files/:fileId',
  method: 'delete',
  handler: async (req) => {
    guardEditor(req)

    const unavailable = storageUnavailable()

    if (unavailable) {
      return unavailable
    }

    const fileId = routeParam(req, 'fileId')

    if (!fileId) {
      throw new APIError('A fileId is required.', 400)
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

    if (!commission) {
      throw new APIError('No such commission.', 404)
    }

    const files = commission.files ?? []
    const doomed = files.find((file) => file.fileId === fileId)

    if (!doomed) {
      throw new APIError('No such file on this commission.', 404)
    }

    const updated = await req.payload.update({
      collection: 'commissions',
      id,
      data: { files: files.filter((file) => file.fileId !== fileId) },
      depth: 0,
      overrideAccess: true,
      req,
    })

    try {
      await deleteObjects({ bucket: getCommissionsBucket(), keys: [doomed.key] })
    } catch (error) {
      req.payload.logger.error(
        { err: error, key: doomed.key },
        'Removed a commission file row but could not delete its S3 object; it is now orphaned.',
      )
    }

    return Response.json({ files: updated.files ?? [] })
  },
}
