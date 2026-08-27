/**
 * The invoice lifecycle, and the lock that comes with leaving `draft`.
 *
 * An issued invoice is a legal document. Under the Bulgarian Accounting Act it
 * cannot be rewritten — a mistake is corrected by cancelling the document and
 * issuing a new one, never by editing the original in place. That is the rule
 * this module enforces, and it is why the numbering in `./numbering.ts` only
 * fires on the way out of `draft`: while an invoice is a draft it is a working
 * document with no number and no consequences, and everything about it is
 * editable.
 *
 * The lock is applied per field via `editableWhileDraft` rather than by rejecting
 * the whole update, because there is a small set of things that legitimately
 * change *after* issuing: the invoice gets sent, then paid, and the artist keeps
 * private notes throughout. Those fields stay open; everything that prints on the
 * document itself closes.
 *
 * Field access is the right lever for this rather than a `beforeChange` guard: it
 * both drops the incoming value server-side and tells the admin panel to render
 * the input read-only, so the artist sees the lock instead of discovering it when
 * a save silently does nothing.
 */
import type { FieldAccess } from 'payload'

export const INVOICE_STATUSES = ['draft', 'issued', 'sent', 'paid', 'cancelled'] as const

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/**
 * Bilingual labels — the admin panel is the artist's, and these are the words
 * they and their accountant use.
 */
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  cancelled: 'Анулирана (Cancelled)',
  draft: 'Чернова (Draft)',
  issued: 'Издадена (Issued)',
  paid: 'Платена (Paid)',
  sent: 'Изпратена (Sent)',
}

/**
 * Where each status may go next.
 *
 * Two deliberate asymmetries:
 *
 * - Nothing returns to `draft`. Once a number is allocated the document exists in
 *   the sequence, and a draft has no number — reopening one would either leave a
 *   gap or invite the number being reused.
 * - `cancelled` is terminal, but `paid` is not. Cancelling is a considered act
 *   whose whole purpose is finality; marking something paid is a bookkeeping
 *   click that a one-person shop will occasionally make on the wrong invoice, so
 *   it can be walked back to `issued` or `sent`.
 */
const TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  cancelled: ['cancelled'],
  draft: ['draft', 'issued', 'cancelled'],
  issued: ['issued', 'sent', 'paid', 'cancelled'],
  paid: ['paid', 'issued', 'sent'],
  sent: ['sent', 'paid', 'issued', 'cancelled'],
}

export const isInvoiceStatus = (value: unknown): value is InvoiceStatus =>
  typeof value === 'string' && (INVOICE_STATUSES as readonly string[]).includes(value)

/** Has this invoice left `draft` — i.e. does it have a number and a lock? */
export const isIssued = (status: null | string | undefined): boolean =>
  isInvoiceStatus(status) && status !== 'draft'

export const canTransition = (from: InvoiceStatus, to: InvoiceStatus): boolean =>
  TRANSITIONS[from].includes(to)

/**
 * Field access for everything that prints on the invoice.
 *
 * `doc` is the document *before* the update and is absent on create, so a new
 * invoice is fully editable and an existing one only while it is still a draft.
 */
export const editableWhileDraft: FieldAccess = ({ doc }) => !doc || !isIssued(doc.status)

/** Field access for values only the server may set: the number and the UUID. */
export const serverAssigned: FieldAccess = () => false
