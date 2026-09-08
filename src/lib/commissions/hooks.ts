/**
 * Server-side rules for a commission document.
 *
 * Both hooks here exist because field access control is not enough. Every
 * Local API call in this codebase passes `overrideAccess: true`, which skips
 * field access entirely — so anything that must hold no matter who is writing
 * has to hold in a hook. The `serverOwned` field access on the collection is an
 * honest admin UI and a closed REST surface; these are the guarantee.
 */
import type { CollectionBeforeDeleteHook, CollectionBeforeValidateHook } from 'payload'

import { randomUUID } from 'node:crypto'

import { deleteObjects, getCommissionsBucket, hasCommissionsBucket } from '@/lib/aws/s3'

import { hashPassword } from './password'

type CommissionData = Record<string, unknown>

/**
 * Mint the UUID, and turn a submitted password into a hash.
 *
 * The UUID is minted on create, like an invoice's: it is not part of any
 * sequence, it is just the unguessable address the client-facing page lives at,
 * and having it from the start means the artist can copy the link before the
 * files are uploaded.
 *
 * It is then **reasserted from the stored document on every update**, and the
 * field's `access: { update: () => false }` is not enough on its own to make
 * that true. Field access is skipped entirely when a caller passes
 * `overrideAccess: true`, which every Local API call in this codebase does — so
 * without the line below, a stray `uuid` in an update payload would silently
 * move a commission to a new address and break a link the client already has.
 * The UUID is the whole authorisation for that link; it has to be immutable in
 * the hook, not merely read-only in the admin panel.
 *
 * The password is handled here, in a collection hook, rather than in a field
 * hook on `password` — a field hook cannot write a sibling field without
 * reaching into `siblingData`, and the rule ("plaintext is never stored, an
 * empty submit leaves the existing password alone") is about two fields at
 * once. The three cases:
 *
 * - `removePassword` ticked → the hash is cleared. An explicit gesture, so that
 *   saving the document with an empty password box cannot silently unlock a
 *   commission the artist meant to keep protected.
 * - a non-empty `password` → hashed into `passwordHash`.
 * - an empty or absent `password` → nothing happens to the hash.
 *
 * In every case `password` itself is nulled before it reaches the database, so
 * the column exists but only ever holds `null`.
 */
export const prepareCommission: CollectionBeforeValidateHook = async ({
  data,
  operation,
  originalDoc,
}) => {
  const next: CommissionData = { ...(data ?? {}) }

  if (operation === 'create' && !next.uuid) {
    next.uuid = randomUUID()
  }

  if (operation === 'update' && originalDoc?.uuid) {
    next.uuid = originalDoc.uuid
  }

  const submitted = typeof next.password === 'string' ? next.password.trim() : ''

  if (next.removePassword === true) {
    next.passwordHash = null
  } else if (submitted) {
    next.passwordHash = await hashPassword(submitted)
  }

  if ('password' in next) {
    next.password = null
  }

  // The checkbox is a gesture, not a state — leaving it ticked would clear the
  // hash again on the next unrelated save.
  if (next.removePassword === true) {
    next.removePassword = false
  }

  return next
}

/**
 * Delete a commission's S3 objects when the document goes.
 *
 * Deliberately best-effort: an S3 failure is logged and the delete proceeds. An
 * orphaned object costs a fraction of a cent a month; a document that cannot be
 * deleted because a bucket is unreachable is a support call. This is the same
 * position `onInit` in `payload.config.ts` takes on non-fatal AWS problems.
 */
export const deleteCommissionObjects: CollectionBeforeDeleteHook = async ({ id, req }) => {
  if (!hasCommissionsBucket()) {
    return
  }

  try {
    const commission = await req.payload.findByID({
      collection: 'commissions',
      id,
      depth: 0,
      overrideAccess: true,
      req,
    })

    const keys = (commission.files ?? [])
      .map((file) => file.key)
      .filter((key): key is string => Boolean(key))

    await deleteObjects({ bucket: getCommissionsBucket(), keys })
  } catch (error) {
    req.payload.logger.error(
      { commissionId: id, err: error },
      'Could not delete the S3 objects for a commission. The document was deleted anyway; the objects are now orphaned.',
    )
  }
}

/**
 * Delete a commission's access-log rows before the commission itself goes.
 *
 * **This is load-bearing, not tidiness.** `commission-access-log.commission` is
 * a required relationship, so Payload generates the column `NOT NULL` while
 * generating the foreign key `ON DELETE set null` — a combination SQLite cannot
 * satisfy. Without this hook, deleting any commission that has ever been viewed
 * fails with `SQLITE_CONSTRAINT_NOTNULL` and the document becomes undeletable.
 *
 * The cascade is therefore done in the application, which is also the behaviour
 * we would want anyway: a log row is only ever read through the `accessLog` join
 * on its commission, so one whose commission is gone is unreachable by
 * construction. Note that this is *not* in tension with the collection's
 * indefinite-retention position — that is about never pruning the log of a live
 * commission, not about keeping rows for a document the artist has deleted.
 *
 * Unlike the S3 cleanup above, a failure here is **not** swallowed: if the rows
 * cannot go, the commission delete is going to fail on the constraint regardless,
 * and an error naming the real cause is far more use than one about a foreign key.
 */
export const deleteCommissionAccessLog: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({
    collection: 'commission-access-log',
    depth: 0,
    // The collection allows `delete` to admins only; this cascade runs on
    // whoever deleted the commission, which the collection has already
    // authorised. The Local API bypasses access control by design.
    overrideAccess: true,
    req,
    where: { commission: { equals: id } },
  })
}
