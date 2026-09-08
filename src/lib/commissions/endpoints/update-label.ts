/**
 * `PATCH /api/commissions/:id/files/:fileId` — editors only.
 *
 * Renames one file as the client sees it. Nothing in S3 moves: `label` is the
 * only field on a row with no object behind it, which is exactly why it is the
 * only one the artist may change after the fact.
 *
 * **Why this endpoint has to exist at all.** The `files` array is server-owned
 * (`access: { create: () => false, update: () => false }`), and a denied field
 * access does more than reject the write — Payload deletes the incoming value
 * and refills it from the stored document *before* it descends into the array's
 * row subfields (see `getFallbackValue` in
 * `payload/dist/fields/hooks/beforeValidate/promise.js`). So a `PATCH` carrying
 * `{ files: [...] }` comes back 200 with the array silently reverted, and a
 * per-subfield `access` carve-out on `label` cannot rescue it: the parent gate
 * has already thrown the rows away by the time that carve-out is consulted.
 *
 * The consequence is that a writable label needs a server-side path with
 * `overrideAccess: true`, which is this. It is the same shape as the register
 * and delete endpoints, and keeps the rule that every mutation of the array
 * goes through one of them.
 */
import type { Endpoint } from 'payload'

import { addDataAndFileToRequest, APIError } from 'payload'

import { documentId, guardEditor, routeParam } from './shared'

/** Long enough for a descriptive name, short enough to stay one line. */
const MAX_LABEL_LENGTH = 200

export const updateCommissionFileLabelEndpoint: Endpoint = {
  path: '/:id/files/:fileId',
  method: 'patch',
  handler: async (req) => {
    guardEditor(req)

    // No S3 involvement, so no `storageUnavailable()` guard: renaming a file
    // must keep working in a checkout with no bucket configured.
    const fileId = routeParam(req, 'fileId')

    if (!fileId) {
      throw new APIError('A fileId is required.', 400)
    }

    await addDataAndFileToRequest(req)

    const { label } = (req.data ?? {}) as { label?: unknown }

    if (typeof label !== 'string' && label !== null) {
      throw new APIError('A label is required, or null to clear it.', 400)
    }

    const trimmed = typeof label === 'string' ? label.trim() : ''

    if (trimmed.length > MAX_LABEL_LENGTH) {
      throw new APIError(`A label cannot be longer than ${MAX_LABEL_LENGTH} characters.`, 400)
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

    if (!files.some((file) => file.fileId === fileId)) {
      throw new APIError('No such file on this commission.', 404)
    }

    const updated = await req.payload.update({
      collection: 'commissions',
      id,
      data: {
        // The whole array goes back with one row changed: Payload array updates
        // replace rather than merge, so sending the single row would delete
        // every other file.
        files: files.map((file) =>
          file.fileId === fileId ? { ...file, label: trimmed || null } : file,
        ),
      },
      depth: 0,
      overrideAccess: true,
      req,
    })

    return Response.json({ files: updated.files ?? [] })
  },
}
