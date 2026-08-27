/**
 * The read side of the client-facing invoice page.
 *
 * One finder, keyed on the invoice's UUID, which is the only thing the client
 * ever holds. It runs through the Local API with `overrideAccess: true` — the
 * `invoices` collection is `editors`-only for a reason, and this is the single
 * deliberate hole in that: possession of a 128-bit random identifier is the
 * authorisation. Nothing else about the request is trusted, and nothing but the
 * invoice at that exact UUID comes back.
 *
 * Uncached, like the finders in `./gallery.ts`: the cached, tagged wrapper the
 * route actually calls is `getInvoiceByUuid` in `./queries.ts`. Splitting them
 * that way is what lets the projection below be exercised directly by the
 * integration tests, which run outside any Next request scope.
 *
 * The projection is where the draft/issued distinction is resolved, so the page
 * component never has to think about it:
 *
 * - An **issued** invoice renders from the snapshot frozen onto its own row. The
 *   client and settings records are not read at all, which is the whole point —
 *   see `@/lib/invoicing/snapshot`.
 * - A **draft** has no snapshot yet, so it renders from the live client and
 *   settings records. That makes the UUID a working preview of the finished
 *   document, at the address it will keep.
 */
import type { Payload } from 'payload'

import type { Media } from '@/payload-types'
import type { BillToSnapshot, SellerSnapshot } from '@/lib/invoicing/snapshot'
import type { Currency } from '@/lib/invoicing/money'
import type { InvoiceLanguage } from '@/lib/invoicing/options'

import { DEFAULT_CURRENCY, isCurrency } from '@/lib/invoicing/money'
import {
  DEFAULT_INVOICE_LANGUAGE,
  isInvoiceLanguage,
  lineUnitLabel,
  paymentMethodLabel,
} from '@/lib/invoicing/options'
import { toBillToSnapshot, toSellerSnapshot } from '@/lib/invoicing/snapshot'
import { isIssued } from '@/lib/invoicing/status'

/**
 * Just enough of a `Media` document to put an `<img>` on the page.
 *
 * Deliberately not `toGalleryImage` from `@/lib/content/gallery`: that helper
 * gates on `media.enabled`, which is the gallery's publication flag. A logo is
 * not gallery content and should not have to be "published" to appear on an
 * invoice.
 */
export type InvoiceImage = {
  alt: string
  height: null | number
  url: string
  width: null | number
}

export type InvoiceLine = {
  amount: number
  description: string
  quantity: number
  /** Already resolved to the invoice's language. */
  unit: null | string
  unitPrice: number
}

export type PublicInvoice = {
  baseTotal: null | number
  billTo: BillToSnapshot
  currency: Currency
  discountAmount: number
  discountPercent: null | number
  dueDate: null | string
  exchangeRate: null | number
  invoiceNumber: null | string
  /** Renders a void banner and greys the document. */
  isCancelled: boolean
  /** No number yet, and rendered from live records rather than a snapshot. */
  isDraft: boolean
  issueDate: string
  /** The one language the whole document is printed in. */
  language: InvoiceLanguage
  lines: InvoiceLine[]
  logo: InvoiceImage | null
  notes: null | string
  paidDate: null | string
  /** Already resolved to the invoice's language. */
  paymentMethod: null | string
  placeOfIssue: null | string
  seller: SellerSnapshot
  signature: InvoiceImage | null
  subtotal: number
  total: number
  totalInWords: null | string
  uuid: string
}

const toInvoiceImage = (media: Media | null | number | undefined): InvoiceImage | null => {
  if (!media || typeof media === 'number' || !media.url) {
    return null
  }

  return {
    alt: media.alt,
    height: media.height ?? null,
    url: media.url,
    width: media.width ?? null,
  }
}

/** An invoice by its public UUID, or `null` when there is none. */
export const findInvoiceByUuid = async ({
  payload,
  uuid,
}: {
  payload: Payload
  uuid: string
}): Promise<null | PublicInvoice> => {
  const { docs } = await payload.find({
    collection: 'invoices',
    // 1 populates the `client` relationship, which the draft path needs. The
    // settings global (and the media inside it) is a separate read below.
    depth: 1,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { uuid: { equals: uuid } },
  })

  const invoice = docs[0]

  if (!invoice) {
    return null
  }

  const settings = await payload.findGlobal({
    slug: 'invoice-settings',
    depth: 1,
    overrideAccess: true,
  })

  const issued = isIssued(invoice.status)

  /**
   * Resolved once here rather than per label in the template, and defaulted
   * defensively: `language` is a required field, but an invoice created before it
   * existed would come back without one.
   */
  const language: InvoiceLanguage = isInvoiceLanguage(invoice.language)
    ? invoice.language
    : DEFAULT_INVOICE_LANGUAGE

  /**
   * A draft has no frozen copy, so its parties are mapped from the live
   * records through the very same mappers that will freeze them on issue —
   * which is what makes the preview faithful rather than merely similar.
   */
  const seller =
    issued && invoice.seller
      ? (invoice.seller as SellerSnapshot)
      : toSellerSnapshot(settings, language)
  const billTo =
    issued && invoice.billTo
      ? (invoice.billTo as BillToSnapshot)
      : toBillToSnapshot(typeof invoice.client === 'object' ? invoice.client : {})

  return {
    baseTotal: invoice.baseTotal ?? null,
    billTo,
    currency: isCurrency(invoice.currency) ? invoice.currency : DEFAULT_CURRENCY,
    discountAmount: invoice.discountAmount ?? 0,
    discountPercent: invoice.discountPercent ?? null,
    dueDate: invoice.dueDate ?? null,
    exchangeRate: invoice.exchangeRate ?? null,
    invoiceNumber: invoice.invoiceNumber ?? null,
    isCancelled: invoice.status === 'cancelled',
    isDraft: !issued,
    issueDate: invoice.issueDate,
    language,
    lines: (invoice.items ?? []).map((row) => ({
      amount: row.total ?? 0,
      description: row.description,
      quantity: row.quantity,
      unit: lineUnitLabel(row.unit, language),
      unitPrice: row.unitPrice,
    })),
    logo: toInvoiceImage(settings.logo),
    notes: invoice.notes ?? null,
    paidDate: invoice.paidDate ?? null,
    paymentMethod: paymentMethodLabel(invoice.paymentMethod, language),
    placeOfIssue: invoice.placeOfIssue ?? null,
    seller,
    signature: toInvoiceImage(settings.signature),
    subtotal: invoice.subtotal ?? 0,
    total: invoice.total ?? 0,
    totalInWords: invoice.totalInWords ?? null,
    uuid: invoice.uuid ?? uuid,
  }
}
