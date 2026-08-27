/**
 * The closed vocabularies an invoice draws on: how it gets paid and what its
 * lines are measured in.
 *
 * Each entry carries two labels, and the distinction matters. `label` is what the
 * artist picks from in the admin panel, so it names both languages at once
 * (`Банков превод (Bank transfer)`). `printed` holds one string per invoice
 * language, and the template renders whichever the invoice is set to — see
 * `InvoiceLanguage` below.
 *
 * Selects store the `value`, so the vocabularies can gain entries freely; removing
 * one would orphan whatever invoices already reference it, which for issued
 * invoices means a printed document that can no longer name its own payment
 * method. Deprecate rather than delete.
 */

export type PrintedLabel = { bg: string; en: string }

/**
 * The language an invoice is printed in.
 *
 * Defined as `keyof PrintedLabel` rather than as its own string union, so the two
 * cannot drift: adding a language to the printed vocabulary is what makes it
 * selectable, and a `PrintedLabel` missing a translation is a type error rather
 * than a blank cell on somebody's invoice.
 *
 * Chosen per invoice rather than per site. The artist bills Bulgarian companies,
 * who need a document their accountant can file, and foreign clients, who need one
 * they can read — and an invoice that prints both for everybody serves neither
 * especially well.
 */
export type InvoiceLanguage = keyof PrintedLabel

export const INVOICE_LANGUAGES = ['bg', 'en'] as const satisfies readonly InvoiceLanguage[]

/** Bulgarian, because the artist is Bulgarian and most invoices stay domestic. */
export const DEFAULT_INVOICE_LANGUAGE: InvoiceLanguage = 'bg'

export const INVOICE_LANGUAGE_OPTIONS: { label: string; value: InvoiceLanguage }[] = [
  { label: 'Български (Bulgarian)', value: 'bg' },
  { label: 'English', value: 'en' },
]

export const isInvoiceLanguage = (value: unknown): value is InvoiceLanguage =>
  typeof value === 'string' && (INVOICE_LANGUAGES as readonly string[]).includes(value)

type Option<TValue extends string> = {
  label: string
  printed: PrintedLabel
  value: TValue
}

export const PAYMENT_METHODS = [
  {
    label: 'Банков превод (Bank transfer)',
    printed: { bg: 'Банков превод', en: 'Bank transfer' },
    value: 'bank',
  },
  {
    label: 'Карта (Card)',
    printed: { bg: 'Карта', en: 'Card' },
    value: 'card',
  },
  {
    label: 'В брой (Cash)',
    printed: { bg: 'В брой', en: 'Cash' },
    value: 'cash',
  },
  {
    label: 'Друго (Other)',
    printed: { bg: 'Друго', en: 'Other' },
    value: 'other',
  },
] as const satisfies readonly Option<string>[]

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

/**
 * Units of measure for a line.
 *
 * `бр.` is the abbreviation used on Bulgarian invoices and is the sensible
 * default: a commission is one of something more often than it is billed by the
 * hour.
 */
export const LINE_UNITS = [
  {
    label: 'брой (piece)',
    printed: { bg: 'бр.', en: 'pcs' },
    value: 'piece',
  },
  {
    label: 'час (hour)',
    printed: { bg: 'час', en: 'hour' },
    value: 'hour',
  },
  {
    label: 'ден (day)',
    printed: { bg: 'ден', en: 'day' },
    value: 'day',
  },
  {
    label: 'месец (month)',
    printed: { bg: 'месец', en: 'month' },
    value: 'month',
  },
  {
    label: 'проект (project)',
    printed: { bg: 'проект', en: 'project' },
    value: 'project',
  },
] as const satisfies readonly Option<string>[]

export type LineUnit = (typeof LINE_UNITS)[number]['value']

const printedLabel = <TValue extends string>(
  options: readonly Option<TValue>[],
  value: null | string | undefined,
  language: InvoiceLanguage,
): null | string => options.find((option) => option.value === value)?.printed[language] ?? null

/** A stored payment method as it prints, or `null` if it is unset or unknown. */
export const paymentMethodLabel = (
  value: null | string | undefined,
  language: InvoiceLanguage,
): null | string => printedLabel(PAYMENT_METHODS, value, language)

/** A stored line unit as it prints, or `null` if it is unset or unknown. */
export const lineUnitLabel = (
  value: null | string | undefined,
  language: InvoiceLanguage,
): null | string => printedLabel(LINE_UNITS, value, language)
