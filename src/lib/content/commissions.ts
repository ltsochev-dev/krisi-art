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
import type { Payload, PayloadRequest, Where } from 'payload'

import type { Commission } from '@/payload-types'

import { normaliseCommissionSlug } from '@/lib/commissions/routes'

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
  /** How the page draws itself — a download list, or a photo grid. */
  layout: CommissionLayout
  title: string
}

/**
 * The two ways a commission presents itself.
 *
 * `files` is the original: a client collecting finished work. `gallery` is the
 * same document — same private bucket, same link, same optional password —
 * rendered as a photo grid, which is what makes a commission usable as a
 * private album shared with friends.
 *
 * Nothing about access control varies between them. The layout decides what the
 * page looks like and nothing else.
 */
export type CommissionLayout = 'files' | 'gallery'

/** Narrows a stored value to a layout, defaulting the way the field does. */
export const toCommissionLayout = (value: unknown): CommissionLayout =>
  value === 'gallery' ? 'gallery' : 'files'

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
const findCommissionRecord = async ({
  payload,
  req,
  where,
}: {
  payload: Payload
  req?: PayloadRequest
  where: Where
}): Promise<Commission | null> => {
  const { docs } = await payload.find({
    collection: 'commissions',
    depth: 0,
    joins: false,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    ...(req ? { req } : {}),
    where,
  })

  return docs[0] ?? null
}

export const findCommissionRecordByUuid = async ({
  payload,
  req,
  uuid,
}: {
  payload: Payload
  req?: PayloadRequest
  uuid: string
}): Promise<Commission | null> =>
  uuid ? await findCommissionRecord({ payload, req, where: { uuid: { equals: uuid } } }) : null

/**
 * The same, keyed on the vanity slug the artist chose.
 *
 * The slug is a *convenience*, not a second secret — see the note at the top of
 * `@/lib/commissions/routes`. This finder is therefore no wider a hole than the
 * UUID one, but it is a shallower one, and a commission addressed by a guessable
 * slug is relying on its password (or on nobody guessing) rather than on the
 * link.
 *
 * The lookup normalises first, so `/album/Prague-2026` finds the commission
 * stored as `prague-2026` instead of 404ing on the capital letter someone's
 * phone keyboard added.
 */
export const findCommissionRecordBySlug = async ({
  payload,
  req,
  slug,
}: {
  payload: Payload
  req?: PayloadRequest
  slug: string
}): Promise<Commission | null> => {
  const normalised = normaliseCommissionSlug(slug)

  return normalised
    ? await findCommissionRecord({ payload, req, where: { slug: { equals: normalised } } })
    : null
}

/**
 * One stored file row, narrowed to what the browser may have.
 *
 * Its own function because a gallery commission needs the same narrowing on a
 * different set of rows — `buildCommissionGallery` splits the array in two and
 * projects each half — and the one omission that matters most is easy to undo
 * by accident: the S3 `key` is not here, and must not be.
 */
export const toPublicCommissionFile = (
  file: NonNullable<Commission['files']>[number],
): PublicCommissionFile => ({
  fileId: file.fileId,
  filesize: file.filesize ?? null,
  mimeType: file.mimeType ?? null,
  name: file.label?.trim() || file.filename,
})

/** Narrows a stored commission to the fields the browser may have. */
export const toPublicCommission = (commission: Commission): PublicCommission => ({
  description: commission.description ?? null,
  files: (commission.files ?? [])
    .filter((file) => Boolean(file.fileId))
    .map(toPublicCommissionFile),
  hasPassword: Boolean(commission.passwordHash),
  layout: toCommissionLayout(commission.layout),
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
