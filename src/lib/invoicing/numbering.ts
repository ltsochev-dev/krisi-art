/**
 * Invoice numbering.
 *
 * Bulgarian invoices carry a ten-digit number that ascends without gaps and
 * never repeats (чл. 78, ал. 1 ППЗДДС). Two consequences shape this module:
 *
 * - The number is a **string**, not an integer. `0000000001` has to print with
 *   its leading zeros, and a number column would lose them.
 * - The number is assigned when the invoice is *issued*, not when the document is
 *   created. A draft that is abandoned must not consume a number, or the sequence
 *   develops the gap the rule forbids.
 *
 * The next value comes from the `invoice-settings` global rather than from a code
 * constant, so the artist can continue a sequence that started in another system
 * — the very first invoice issued here can be `0000000247`. It is reconciled
 * against the highest number already in the table on every allocation, so a
 * settings value that is edited downwards (by accident or otherwise) cannot mint
 * a duplicate. The unique index on `invoices.invoiceNumber` is the last line of
 * defence behind that.
 */
import type { PayloadRequest } from 'payload'

/** Ten digits, per чл. 78 ППЗДДС. */
export const INVOICE_NUMBER_LENGTH = 10

/** The largest sequence value the ten-digit format can express. */
export const MAX_INVOICE_NUMBER = 10 ** INVOICE_NUMBER_LENGTH - 1

/** `247` -> `0000000247`. */
export const formatInvoiceNumber = (sequence: number): string =>
  String(Math.trunc(sequence)).padStart(INVOICE_NUMBER_LENGTH, '0')

/** `0000000247` -> `247`, or `null` for anything that is not a sequence value. */
export const parseInvoiceNumber = (value: null | string | undefined): null | number => {
  if (!value || !/^\d+$/.test(value)) {
    return null
  }

  const parsed = Number.parseInt(value, 10)

  return Number.isSafeInteger(parsed) ? parsed : null
}

/**
 * The highest sequence value already issued, or `0` when nothing has been.
 *
 * Sorting the text column descending is the same as sorting numerically *because*
 * every stored number is padded to a fixed width — which is the second reason the
 * padding is not merely cosmetic.
 */
const highestIssued = async ({ req }: { req: PayloadRequest }): Promise<number> => {
  const { docs } = await req.payload.find({
    collection: 'invoices',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: { invoiceNumber: true },
    sort: '-invoiceNumber',
    where: { invoiceNumber: { exists: true } },
  })

  return parseInvoiceNumber(docs[0]?.invoiceNumber) ?? 0
}

/**
 * Take the next number out of the sequence and advance it.
 *
 * Call this from inside the issuing hook and pass its `req` through, so both the
 * read of the global and the write back to it join the transaction that is
 * already writing the invoice. If that transaction rolls back, the counter rolls
 * back with it and the number is not burned.
 *
 * Safe under SQLite specifically because the database has a single writer, so two
 * invoices cannot be issued concurrently. On an engine that allows more, this
 * needs a row lock (`SELECT … FOR UPDATE`) around the read-modify-write rather
 * than the reconciliation below.
 */
export const allocateInvoiceNumber = async ({
  req,
}: {
  req: PayloadRequest
}): Promise<{ number: string; sequence: number }> => {
  const settings = await req.payload.findGlobal({
    slug: 'invoice-settings',
    depth: 0,
    overrideAccess: true,
    req,
  })

  const configured = settings.numbering?.nextNumber ?? 1
  const sequence = Math.max(configured, (await highestIssued({ req })) + 1, 1)

  if (sequence > MAX_INVOICE_NUMBER) {
    throw new Error(
      `The invoice sequence has reached its ${INVOICE_NUMBER_LENGTH}-digit ceiling (${MAX_INVOICE_NUMBER}).`,
    )
  }

  await req.payload.updateGlobal({
    slug: 'invoice-settings',
    // The settings global has no cached frontend reads worth busting per
    // allocation; the invoice's own afterChange hook handles the invalidation.
    context: { disableRevalidate: true },
    data: { numbering: { nextNumber: sequence + 1 } },
    depth: 0,
    overrideAccess: true,
    req,
  })

  return { number: formatInvoiceNumber(sequence), sequence }
}
