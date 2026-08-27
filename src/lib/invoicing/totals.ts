/**
 * Invoice arithmetic: line totals, subtotal, discount, grand total, and the
 * amount in words.
 *
 * Every one of these is **derived**, so none of them is editable in the admin
 * panel — the artist types descriptions, quantities and unit prices, and this
 * recomputes the rest on every save. Storing the results rather than computing
 * them at render time is the deliberate choice: an issued invoice has to print
 * the same numbers in five years' time, and a rounding rule that changes in this
 * file must not retroactively change a document that has already gone to a
 * client. The stored values are the record; this function only ever writes them
 * while the invoice is a draft.
 *
 * There is no VAT anywhere in here. The artist is not registered under the
 * Bulgarian VAT act, so the invoice total *is* the sum of its lines and the
 * document carries the note required by чл. 113, ал. 9 ЗДДС instead of a tax
 * breakdown — see `legalNote` on the `invoice-settings` global. Adding VAT later
 * means a rate on the settings global and two more lines here, not a rework.
 */
import type { InvoiceLanguage } from './options'
import type { Currency } from './money'

import { fromMinor, isCurrency, lineTotalMinor, percentOfMinor, convertToBase } from './money'
import { DEFAULT_INVOICE_LANGUAGE, isInvoiceLanguage } from './options'
import { amountToWords } from './words'

/**
 * The currency the invoice's own total is restated in when it is billed in
 * something else. Bulgaria adopted the euro on 1 January 2026, so this is the
 * accounting currency the books are kept in.
 */
export const BASE_CURRENCY: Currency = 'EUR'

/** The shape this needs off a line row — a subset of the stored array field. */
export type InvoiceLineInput = {
  quantity?: null | number
  unitPrice?: null | number
}

export type InvoiceTotalsInput = {
  currency?: null | string
  discountPercent?: null | number
  exchangeRate?: null | number
  items?: InvoiceLineInput[] | null
  /** Which language `totalInWords` is spelled in. */
  language?: null | string
}

export type InvoiceTotals = {
  /** The grand total converted at `exchangeRate`, or `null` when not applicable. */
  baseTotal: null | number
  discountAmount: number
  /** One entry per input line, in the same order. */
  lineTotals: number[]
  subtotal: number
  total: number
  /**
   * `total` spelled out in the invoice's language, or `null` where that language
   * has no established form for the currency.
   */
  totalInWords: null | string
}

/** A percentage that is safe to apply: a real number clamped to 0–100. */
const normalisePercent = (value: null | number | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0
  }

  return Math.min(value, 100)
}

/**
 * Recompute every derived amount on an invoice.
 *
 * All addition happens in integer minor units and converts back exactly once per
 * output, so the printed lines always sum to the printed subtotal — see the note
 * at the top of `./money.ts` for why that is not automatic.
 *
 * The discount is taken off the subtotal as a single rounded amount rather than
 * spread across the lines, which is how a discount appears on a Bulgarian
 * invoice: its own row under the subtotal, not a quiet adjustment to the prices.
 */
export const computeInvoiceTotals = (input: InvoiceTotalsInput): InvoiceTotals => {
  const currency = isCurrency(input.currency) ? input.currency : BASE_CURRENCY
  const language: InvoiceLanguage = isInvoiceLanguage(input.language)
    ? input.language
    : DEFAULT_INVOICE_LANGUAGE
  const rows = input.items ?? []

  const lineMinors = rows.map((row) =>
    lineTotalMinor(row.unitPrice ?? 0, typeof row.quantity === 'number' ? row.quantity : 0),
  )

  const subtotalMinor = lineMinors.reduce((sum, minor) => sum + minor, 0)
  const discountMinor = percentOfMinor(subtotalMinor, normalisePercent(input.discountPercent))
  const totalMinor = subtotalMinor - discountMinor
  const total = fromMinor(totalMinor)

  return {
    // Only meaningful when the invoice is billed in something other than the
    // books' currency; otherwise the rate field is hidden and this stays null.
    baseTotal: currency === BASE_CURRENCY ? null : convertToBase(total, input.exchangeRate),
    discountAmount: fromMinor(discountMinor),
    lineTotals: lineMinors.map(fromMinor),
    subtotal: fromMinor(subtotalMinor),
    total,
    totalInWords: amountToWords(total, currency, language),
  }
}
