/**
 * The server-side rules that make an invoice an invoice.
 *
 * There are two enforcement mechanisms in this module and they are not
 * redundant:
 *
 * - **Field access** (`editableWhileDraft` in `./status.ts`) is what the *admin
 *   panel* reads to render an issued invoice's inputs as read-only. Payload
 *   fetches the document before computing field permissions, so those functions
 *   really do see the current status. It is an honest UI, and it drops denied
 *   writes over REST.
 * - **The hooks below** are the actual guarantee. Field access is skipped
 *   entirely when a caller passes `overrideAccess: true`, which every Local API
 *   call in this codebase does — so anything that must hold for a legal document
 *   regardless of who is writing has to hold here. `FROZEN_ON_ISSUE` is
 *   therefore reasserted from `originalDoc` on every update to an issued invoice,
 *   rather than trusted to be absent from `data`.
 *
 * A note on `data` in `beforeChange`: it is the *incoming* data, not the merged
 * document. Payload merges each field against the stored value later, in the
 * field-level pass. So anything computed from more than one field reads through
 * `merged()` below, or a partial update over REST would compute a subtotal from
 * the two lines it happened to send.
 */
import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
} from 'payload'

import { randomUUID } from 'crypto'
import { APIError } from 'payload'

import { allocateInvoiceNumber } from './numbering'
import { DEFAULT_INVOICE_LANGUAGE, isInvoiceLanguage } from './options'
import { buildInvoiceSnapshots } from './snapshot'
import {
  canTransition,
  isInvoiceStatus,
  isIssued,
  INVOICE_STATUS_LABELS,
  type InvoiceStatus,
} from './status'
import { computeInvoiceTotals } from './totals'

/**
 * Everything that prints on the invoice, plus everything derived from it.
 *
 * Once the invoice leaves `draft`, each of these is pinned to the value it had at
 * that moment. What is deliberately *not* in the list is the rest of the
 * lifecycle: `status`, `paidDate` and `internalNotes` stay editable forever,
 * because getting paid and keeping notes are things that happen to an issued
 * invoice rather than changes to it.
 */
const FROZEN_ON_ISSUE = [
  'baseTotal',
  'billTo',
  'client',
  'currency',
  'discountAmount',
  'discountPercent',
  'dueDate',
  'exchangeRate',
  'invoiceNumber',
  'issueDate',
  'items',
  'language',
  'notes',
  'paymentMethod',
  'placeOfIssue',
  'seller',
  'subtotal',
  'total',
  'totalInWords',
  'uuid',
] as const

type InvoiceData = Record<string, unknown>

/** A field's incoming value, falling back to the stored one when absent. */
const merged = <T>(data: InvoiceData, originalDoc: InvoiceData | undefined, key: string): T =>
  (key in data ? data[key] : originalDoc?.[key]) as T

const statusOf = (source: InvoiceData | undefined): InvoiceStatus =>
  isInvoiceStatus(source?.status) ? source.status : 'draft'

/**
 * Assign the public UUID, and refuse impossible status changes.
 *
 * The UUID is minted on create rather than on issue, unlike the invoice number.
 * It is not part of a regulated sequence — it is just the unguessable address the
 * client-facing page lives at — and having it from the start means a draft can be
 * previewed at its final URL before anything is committed.
 */
export const prepareInvoice: CollectionBeforeValidateHook = ({ data, operation, originalDoc }) => {
  const next: InvoiceData = { ...(data ?? {}) }

  if (operation === 'create' && !next.uuid) {
    next.uuid = randomUUID()
  }

  if (operation === 'update' && originalDoc) {
    const from = statusOf(originalDoc as InvoiceData)
    const to = statusOf({ status: merged(next, originalDoc as InvoiceData, 'status') })

    if (!canTransition(from, to)) {
      throw new APIError(
        `An invoice cannot go from ${INVOICE_STATUS_LABELS[from]} to ${INVOICE_STATUS_LABELS[to]}.` +
          (to === 'draft'
            ? ' An issued invoice keeps its number for good — cancel it and issue a new one instead.'
            : ''),
        400,
        undefined,
        true,
      )
    }
  }

  return next
}

/**
 * Recompute the derived amounts, allocate the number on issue, freeze everything
 * afterwards.
 *
 * The three branches are mutually exclusive and in priority order: an already
 * issued invoice is frozen and nothing else happens to it; an invoice being
 * issued right now gets its number and its snapshots; a draft simply has its
 * totals refreshed.
 */
export const applyInvoiceRules: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const next: InvoiceData = { ...data }
  const original = originalDoc as InvoiceData | undefined
  const wasIssued = operation === 'update' && isIssued(statusOf(original))

  if (wasIssued) {
    for (const field of FROZEN_ON_ISSUE) {
      next[field] = original?.[field] ?? null
    }

    return withPaidDate(next, original)
  }

  // --- Draft, or a draft on its way out ------------------------------------

  const currency = merged<string>(next, original, 'currency')
  const items = merged<{ quantity?: number; total?: number; unitPrice?: number }[]>(
    next,
    original,
    'items',
  )
  const rows = Array.isArray(items) ? items : []

  const totals = computeInvoiceTotals({
    currency,
    discountPercent: merged<null | number>(next, original, 'discountPercent'),
    exchangeRate: merged<null | number>(next, original, 'exchangeRate'),
    items: rows,
    // `totalInWords` is stored, so the language has to be known here rather than
    // at render time: switching an invoice from Bulgarian to English while it is
    // still a draft respells the line on the next save.
    language: merged<string>(next, original, 'language'),
  })

  // Line totals are written back onto the rows so the admin panel and the printed
  // invoice read the same stored number, rather than each doing its own
  // multiplication and rounding.
  next.items = rows.map((row, index) => ({ ...row, total: totals.lineTotals[index] ?? 0 }))
  next.subtotal = totals.subtotal
  next.discountAmount = totals.discountAmount
  next.total = totals.total
  next.totalInWords = totals.totalInWords
  next.baseTotal = totals.baseTotal

  // The UUID is never rewritten by a client, only carried forward.
  next.uuid = original?.uuid ?? next.uuid ?? randomUUID()

  if (!isIssued(merged<string>(next, original, 'status'))) {
    // Still a draft: it has no number, and must not be holding one.
    next.invoiceNumber = null

    return withPaidDate(next, original)
  }

  // --- Being issued, right now ---------------------------------------------

  if (rows.length === 0) {
    throw new APIError(
      'An invoice needs at least one line item before it can be issued.',
      400,
      undefined,
      true,
    )
  }

  const clientId = merged<number | string | { id: number | string }>(next, original, 'client')
  const resolvedClientId =
    clientId && typeof clientId === 'object' && 'id' in clientId ? clientId.id : clientId

  if (!resolvedClientId) {
    throw new APIError('An invoice needs a client before it can be issued.', 400, undefined, true)
  }

  const rawLanguage = merged<string>(next, original, 'language')

  const { billTo, seller } = await buildInvoiceSnapshots({
    clientId: resolvedClientId,
    // The snapshot resolves the legal note against this, so it has to be the
    // language the invoice is actually being issued in.
    language: isInvoiceLanguage(rawLanguage) ? rawLanguage : DEFAULT_INVOICE_LANGUAGE,
    req,
  })

  if (!seller.legalName || !seller.identifier) {
    throw new APIError(
      'Fill in the issuer name and ЕИК/БУЛСТАТ under Invoicing → Settings before issuing an invoice.',
      400,
      undefined,
      true,
    )
  }

  next.billTo = billTo
  next.seller = seller

  // `allocateInvoiceNumber` advances the sequence on the settings global inside
  // this same transaction, so a failure further down this hook — or in the write
  // itself — rolls the counter back rather than burning a number.
  if (!original?.invoiceNumber) {
    const { number } = await allocateInvoiceNumber({ req })

    next.invoiceNumber = number
  } else {
    next.invoiceNumber = original.invoiceNumber
  }

  next.dueDate =
    merged<null | string>(next, original, 'dueDate') ??
    (await defaultDueDate({ issueDate: merged<null | string>(next, original, 'issueDate'), req }))

  return withPaidDate(next, original)
}

/**
 * Keep `paidDate` consistent with `status` without ever silently discarding a
 * date the artist typed.
 *
 * Marking an invoice paid stamps today unless a date is already set — the common
 * case is being told about a transfer that landed some days ago, and the field is
 * left editable for exactly that. Walking the status back off `paid` clears it,
 * because a payment date on an unpaid invoice is worse than none.
 */
const withPaidDate = (next: InvoiceData, original: InvoiceData | undefined): InvoiceData => {
  const status = statusOf({ status: merged(next, original, 'status') })

  if (status === 'paid') {
    next.paidDate = merged<null | string>(next, original, 'paidDate') ?? new Date().toISOString()
  } else {
    next.paidDate = null
  }

  return next
}

/**
 * The due date implied by the payment terms in settings, used when the artist
 * leaves the field blank. A `paymentTermsDays` of 0 means due on issue.
 *
 * `issueDate` is passed in already merged rather than read off the incoming data:
 * an invoice issued by a partial `PATCH` that sends only `{ status: 'issued' }`
 * would otherwise count its terms from today instead of from the date on the
 * document.
 */
const defaultDueDate = async ({
  issueDate,
  req,
}: {
  issueDate: null | string | undefined
  req: Parameters<CollectionBeforeChangeHook>[0]['req']
}): Promise<null | string> => {
  const settings = await req.payload.findGlobal({
    slug: 'invoice-settings',
    depth: 0,
    overrideAccess: true,
    req,
  })

  const days = settings.defaults?.paymentTermsDays

  if (typeof days !== 'number' || !Number.isFinite(days)) {
    return null
  }

  const issued = issueDate ? new Date(issueDate) : new Date()

  if (Number.isNaN(issued.getTime())) {
    return null
  }

  issued.setDate(issued.getDate() + Math.max(0, Math.trunc(days)))

  return issued.toISOString()
}

/**
 * An issued invoice cannot be deleted.
 *
 * The Accounting Act requires invoices to be kept for years after the fact, and
 * the numbering rule requires the sequence to have no holes — deleting the middle
 * of it produces exactly the gap чл. 78 ППЗДДС forbids. `cancelled` is the
 * intended way out: the document stays, its number stays consumed, and it is
 * plainly marked void. Drafts, having neither a number nor legal weight, are
 * free to delete.
 */
export const guardInvoiceDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const invoice = await req.payload.findByID({
    collection: 'invoices',
    depth: 0,
    id,
    overrideAccess: true,
    req,
  })

  if (isIssued(invoice.status)) {
    throw new APIError(
      `Invoice ${invoice.invoiceNumber} has been issued and cannot be deleted — set its status to “Анулирана (Cancelled)” instead.`,
      400,
      undefined,
      true,
    )
  }
}
