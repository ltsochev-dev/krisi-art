/**
 * The read side of the client-facing commission page.
 *
 * One finder, keyed on the commission's UUID, which is the only thing the
 * client ever holds. It runs through the Local API with `overrideAccess: true` —
 * the `commissions` collection is `editors`-only for a reason, and this is the
 * single deliberate hole in that: possession of a 128-bit random identifier is
 * the authorisation. Nothing else about the request is trusted, and nothing but
 * the commission at that exact UUID comes back. The same arrangement as
 * `./invoices.ts`, for the same reason.
 *
 * **Uncached, and no entry in `CACHE_TAGS`.** This is a deliberate departure
 * from the tagged, `unstable_cache`-wrapped finders in `./queries.ts`, and not
 * an omission to be tidied up later. The audience for a commission page is one
 * person clicking one link, so there is nothing for a cache to protect from
 * load — and every view increments a counter on the document, which behind a
 * tagged cache would mean a full invalidation per page view. A cache here would
 * cost more than it saved and would make the view counter lie.
 */
import type { Payload, PayloadRequest } from 'payload'

import type { Commission } from '@/payload-types'

/**
 * What the browser is allowed to know about a commission.
 *
 * The key set below is the entire boundary between an internal note and the
 * client, so it is worth reading as a list of *omissions*: no `passwordHash`,
 * no `internalNotes`, no `viewCount` or `downloadCount`, no `expiresAt`, and —
 * most importantly — no S3 `key` for any file. A key is not a secret on its
 * own, since the bucket refuses anonymous reads, but shipping one to the
 * browser would invite a future change that signs a URL from a client-supplied
 * key instead of from the row. The client gets a `fileId` and asks the server
 * for a URL; that is the only download path.
 *
 * `uuid` is not here either, because the page already has it from the route
 * params — the projection has no reason to hand it back.
 */
export type PublicCommission = {
  description: null | string
  files: PublicCommissionFile[]
  /** So the page knows to render the password gate. Never the hash itself. */
  hasPassword: boolean
  title: string
}

export type PublicCommissionFile = {
  fileId: string
  filesize: null | number
  mimeType: null | string
  /** The label if the artist set one, otherwise the original filename. */
  name: string
}

export type CommissionGate = { ok: true } | { ok: false; reason: 'disabled' | 'expired' }

/**
 * Whether this commission's link resolves right now.
 *
 * One helper, called by the page and by both public endpoints, so the three can
 * never drift into disagreeing about whether a link is live. The two states are
 * kept separate because they read differently in the access log — an expired
 * link was working once, a disabled one may never have been.
 *
 * The caller gets the reason but the *client* never does: every refusal renders
 * as a plain 404, so the page never confirms that a UUID was ever valid.
 */
export const evaluateCommissionGate = (
  commission: Pick<Commission, 'enabled' | 'expiresAt'>,
  now: Date = new Date(),
): CommissionGate => {
  if (!commission.enabled) {
    return { ok: false, reason: 'disabled' }
  }

  if (commission.expiresAt) {
    const expiresAt = new Date(commission.expiresAt)

    /**
     * `expiresAt` is a day-only picker, so it arrives as midnight UTC on the
     * chosen day. The link is meant to work *through* that day, so the
     * comparison is against the end of it rather than its start — otherwise
     * picking "the 20th" would expire the link on the 19th as far as the client
     * is concerned.
     */
    if (Number.isFinite(expiresAt.getTime()) && now.getTime() >= expiresAt.getTime() + 86_400_000) {
      return { ok: false, reason: 'expired' }
    }
  }

  return { ok: true }
}

/**
 * The raw commission document at a UUID, for code that needs the parts the
 * client never sees — the S3 keys, the password hash, the counters.
 *
 * `depth: 0`: nothing on the document is a relationship worth populating, and
 * the `accessLog` join would otherwise be fetched on every download.
 */
export const findCommissionRecordByUuid = async ({
  payload,
  req,
  uuid,
}: {
  payload: Payload
  req?: PayloadRequest
  uuid: string
}): Promise<Commission | null> => {
  if (!uuid) {
    return null
  }

  const { docs } = await payload.find({
    collection: 'commissions',
    depth: 0,
    joins: false,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    ...(req ? { req } : {}),
    where: { uuid: { equals: uuid } },
  })

  return docs[0] ?? null
}

/** Narrows a stored commission to the fields the browser may have. */
export const toPublicCommission = (commission: Commission): PublicCommission => ({
  description: commission.description ?? null,
  files: (commission.files ?? [])
    .filter((file) => Boolean(file.fileId))
    .map((file) => ({
      fileId: file.fileId,
      filesize: file.filesize ?? null,
      mimeType: file.mimeType ?? null,
      name: file.label?.trim() || file.filename,
    })),
  hasPassword: Boolean(commission.passwordHash),
  title: commission.title,
})

/**
 * A commission by its public UUID, gated, projected — or `null`.
 *
 * `null` covers all three of "no such commission", "not enabled yet" and
 * "expired", so a caller cannot accidentally render one of the last two. The
 * endpoints that need to tell them apart in order to log a reason call
 * `findCommissionRecordByUuid` and `evaluateCommissionGate` themselves.
 */
export const findCommissionByUuid = async ({
  payload,
  uuid,
}: {
  payload: Payload
  uuid: string
}): Promise<null | PublicCommission> => {
  const commission = await findCommissionRecordByUuid({ payload, uuid })

  if (!commission || !evaluateCommissionGate(commission).ok) {
    return null
  }

  return toPublicCommission(commission)
}
