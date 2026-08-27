/**
 * The printed invoice's vocabulary and its number formatting, in each language it
 * can be issued in.
 *
 * Every label is stored as a `PrintedLabel` — one string per language — and the
 * template reads the one the invoice is set to (`INVOICE_LABELS.total[language]`).
 * Keeping both translations side by side in a single table rather than in two
 * per-language files is what makes a missing translation a type error instead of a
 * blank cell, and it means the wording can be reviewed — and corrected by someone
 * who reads Bulgarian — in one place.
 *
 * The formatting helpers below take the language for the same reason the labels do.
 * A document that says `INVOICE` and then prints `1 900,00` and `03.09.2026` is
 * only half translated: those are the two places where an English reader would
 * actually misread the content rather than merely find it foreign.
 */
import type { InvoiceLanguage, PrintedLabel } from './options'

export const INVOICE_LABELS = {
  amount: { bg: 'Сума', en: 'Amount' },
  bank: { bg: 'Банка', en: 'Bank' },
  baseEquivalent: { bg: 'Равностойност', en: 'Equivalent' },
  bic: { bg: 'BIC / SWIFT', en: 'BIC / SWIFT' },
  cancelled: { bg: 'АНУЛИРАНА', en: 'CANCELLED' },
  description: { bg: 'Описание', en: 'Description' },
  discount: { bg: 'Отбив', en: 'Discount' },
  draft: { bg: 'ЧЕРНОВА', en: 'DRAFT' },
  dueDate: { bg: 'Срок за плащане', en: 'Due date' },
  eik: { bg: 'ЕИК / БУЛСТАТ', en: 'Company ID' },
  email: { bg: 'Имейл', en: 'Email' },
  iban: { bg: 'IBAN', en: 'IBAN' },
  issueDate: { bg: 'Дата на издаване', en: 'Issue date' },
  issuer: { bg: 'Издател', en: 'Issuer' },
  number: { bg: '№', en: 'No.' },
  paidOn: { bg: 'Платена на', en: 'Paid on' },
  payment: { bg: 'Плащане', en: 'Payment' },
  paymentMethod: { bg: 'Начин на плащане', en: 'Payment method' },
  phone: { bg: 'Телефон', en: 'Phone' },
  placeOfIssue: { bg: 'Място на издаване', en: 'Place of issue' },
  print: { bg: 'Принтирай', en: 'Print' },
  quantity: { bg: 'Кол.', en: 'Qty' },
  rate: { bg: 'курс', en: 'rate' },
  recipient: { bg: 'Получател', en: 'Recipient' },
  responsiblePerson: { bg: 'МОЛ', en: 'Responsible person' },
  signature: { bg: 'Подпис', en: 'Signature' },
  subtotal: { bg: 'Междинна сума', en: 'Subtotal' },
  title: { bg: 'ФАКТУРА', en: 'INVOICE' },
  total: { bg: 'Общо за плащане', en: 'Total due' },
  totalInWords: { bg: 'Словом', en: 'In words' },
  unit: { bg: 'Мярка', en: 'Unit' },
  unitPrice: { bg: 'Ед. цена', en: 'Unit price' },
  vatNumber: { bg: 'ДДС номер', en: 'VAT number' },
} as const satisfies Record<string, PrintedLabel>

export type InvoiceLabelKey = keyof typeof INVOICE_LABELS

/**
 * Full sentences, kept apart from the labels above because they are prose rather
 * than field names — a translator treats the two differently, and these are the
 * only strings on the page that have to read as English rather than as a caption.
 */
export const INVOICE_PROSE = {
  cancelledNote: {
    bg: 'Тази фактура е анулирана и не следва да се плаща.',
    en: 'This invoice has been cancelled and is not payable.',
  },
  draftNote: {
    bg: 'Все още не е издадена и няма номер.',
    en: 'Not yet issued; it has no invoice number.',
  },
  notFoundBody: {
    bg: 'Проверете дали връзката е пълна, или се свържете с издателя.',
    en: 'Check that the link is complete, or get in touch with the issuer.',
  },
  notFoundTitle: {
    bg: 'Фактурата не е намерена',
    en: 'Invoice not found',
  },
} as const satisfies Record<string, PrintedLabel>

/**
 * The `Intl` locale each language formats its numbers in.
 *
 * `en-GB` rather than `en-US`: the decimal point and the comma grouping are the
 * same in both, and the British locale is the closer fit for a European invoice
 * everywhere else it differs.
 */
export const LOCALES: Record<InvoiceLanguage, string> = {
  bg: 'bg-BG',
  en: 'en-GB',
}

/**
 * A date in the form the invoice's language reads without ambiguity.
 *
 * Bulgarian gets `03.09.2026`, which is the domestic convention. English gets
 * `3 Sep 2026` — a named month rather than digits, because `03.09.2026` is the
 * third of September to a European reader and the ninth of March to an American
 * one, and a due date is not a good place to leave that open.
 *
 * `bg` is hand-formatted rather than taken from `Intl`, which renders the locale's
 * date as `3.09.2026 г.`: the trailing `г.` is correct Bulgarian but reads as noise
 * in a table, and the day is not zero-padded.
 *
 * Both are computed in UTC, because the stored value is an ISO timestamp at
 * midnight UTC — formatting it in a timezone behind Greenwich would print the
 * previous day.
 */
export const formatInvoiceDate = (
  value: null | string | undefined,
  language: InvoiceLanguage,
): null | string => {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  if (language === 'en') {
    return new Intl.DateTimeFormat(LOCALES.en, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
      year: 'numeric',
    }).format(date)
  }

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')

  return `${day}.${month}.${date.getUTCFullYear()}`
}

/**
 * A quantity as it should read on a line: `2` rather than `2.00`, and with the
 * decimal separator of the language the money on the same row uses.
 */
export const formatQuantity = (value: number, language: InvoiceLanguage): string =>
  new Intl.NumberFormat(LOCALES[language], { maximumFractionDigits: 2 }).format(value)

/**
 * An exchange rate. Five decimals because that is the precision the BNB publishes
 * at, and the language's own separator so it does not read as a different kind of
 * number from the money it sits under.
 */
export const formatRate = (value: number, language: InvoiceLanguage): string =>
  new Intl.NumberFormat(LOCALES[language], { maximumFractionDigits: 5 }).format(value)
