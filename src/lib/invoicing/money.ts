/**
 * Money arithmetic for the invoicing module.
 *
 * Every amount the artist types is a decimal with two places (`1200.50`), and
 * that is how it is stored — a `number` field the admin panel can render as a
 * plain currency input. Arithmetic, however, never happens in that
 * representation: `0.1 + 0.2` is `0.30000000000000004`, and an invoice whose
 * lines sum to a hundredth more than its total is an invoice an accountant
 * rejects.
 *
 * So the rule throughout this module is: convert to integer minor units
 * (стотинки / cents) at the boundary, do all the addition and multiplication
 * there, and convert back exactly once at the end. `toMinor` rounds on the way
 * in, which is what makes it safe — a float that arrives as `12.004999999` from
 * JSON becomes `1200`, not `1200.4999`.
 *
 * Half-up rounding via `Math.round` matches what a person does by hand and what
 * Bulgarian accounting practice expects. Note that `Math.round(-0.5)` is `-0`
 * rather than `-1`; amounts here are never negative (there are no credit notes
 * in this module), so that asymmetry is unreachable.
 */

/** Currencies the module knows how to price an invoice in. */
export const CURRENCIES = ['EUR', 'BGN', 'USD', 'GBP'] as const

export type Currency = (typeof CURRENCIES)[number]

/** The currency an invoice defaults to when settings say nothing. */
export const DEFAULT_CURRENCY: Currency = 'EUR'

export const isCurrency = (value: unknown): value is Currency =>
  typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value)

/** Decimal amount to integer minor units. `12.34` -> `1234`. */
export const toMinor = (amount: number): number => Math.round(amount * 100)

/** Integer minor units back to a two-place decimal. `1234` -> `12.34`. */
export const fromMinor = (minor: number): number => minor / 100

/**
 * Snap a decimal to two places, for values that come out of a division rather
 * than out of the minor-unit path — the exchange-rate conversion below being the
 * only one.
 */
export const roundMoney = (amount: number): number => fromMinor(toMinor(amount))

/**
 * One line's total: unit price times quantity.
 *
 * Quantity is deliberately allowed to be fractional (2.5 hours, 0.5 days), so
 * the multiplication happens in minor units and rounds once. `1234 * 2.5` is
 * exact in binary floating point, but `1234 * 0.1` is not — hence the round
 * rather than a bare product.
 */
export const lineTotalMinor = (unitPrice: number, quantity: number): number =>
  Math.round(toMinor(unitPrice) * quantity)

/** A percentage of an amount, in minor units. Used for the optional discount. */
export const percentOfMinor = (minor: number, percent: number): number =>
  Math.round((minor * percent) / 100)

/**
 * Convert a total into the invoice's base currency at a given rate.
 *
 * Rates are quoted as "how many units of the invoice currency make one unit of
 * the base currency" — the direction the BNB publishes — so this divides.
 * A missing, zero or negative rate yields `null` rather than an `Infinity` that
 * would render as garbage on the printed invoice.
 */
export const convertToBase = (amount: number, rate: null | number | undefined): null | number => {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    return null
  }

  return roundMoney(amount / rate)
}

/**
 * Currency formatting for the printed invoice and the admin list view.
 *
 * `bg-BG` puts the currency after the amount and separates thousands with a
 * non-breaking space (`1 200,50 EUR`), which is the convention on a Bulgarian
 * document. The English half of the bilingual layout shows the same string rather
 * than a re-formatted one: a number that appears twice in two formats on one
 * invoice reads as two different numbers.
 *
 * `currencyDisplay: 'code'` rather than the default symbol, for the sake of the
 * currencies that are not the euro: `bg-BG` renders USD as `щ.д.`, which is
 * correct Bulgarian and useless to the American client receiving the invoice. The
 * ISO code reads the same in both languages, and is what an accountant expects on
 * a document anyway.
 *
 * `useGrouping: true` overrides the locale's own `minimumGroupingDigits: 2`,
 * which would print `1200,50` ungrouped but `12 500,50` grouped. Locale-correct in
 * prose, but on an invoice these are a column of right-aligned figures that get
 * compared to each other, and a separator that comes and goes with the magnitude
 * makes that column harder to scan.
 */
export const formatMoney = (amount: number, currency: Currency, locale = 'bg-BG'): string =>
  new Intl.NumberFormat(locale, {
    currency,
    currencyDisplay: 'code',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
    // `true` rather than the equivalent `'always'`: the string form landed in
    // NumberFormat v3, whose typings need `lib: ES2023`, and this project targets
    // ES2022. Both mean the same thing at runtime.
    useGrouping: true,
  }).format(amount)
