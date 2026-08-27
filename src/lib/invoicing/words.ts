/**
 * Numbers spelled out, for the "in words" line under an invoice total.
 *
 * Not a legal requirement in itself, but the convention is old and near-universal
 * on both a Bulgarian «словом» line and an English one: the words are what an
 * accountant reads to confirm the digits were not tampered with, so getting the
 * grammar right matters more here than it looks.
 *
 * Two independent implementations rather than one parameterised over a table of
 * words, because the two languages disagree about more than vocabulary — see the
 * three points below for Bulgarian, none of which English has, against English's
 * hyphenation and its own placement of "and", which Bulgarian does not share.
 *
 * Three pieces of Bulgarian grammar drive the implementation:
 *
 * 1. **Gender.** The numerals 1 and 2 agree with the noun they count, and the
 *    nouns involved here disagree with each other: `хиляда` is feminine
 *    (`две хиляди`), `милион` is masculine (`един милион`), `лев` is masculine
 *    (`един лев`) and `евро` is neuter (`едно евро`). So every group is rendered
 *    against the gender of its own scale word, and the final group against the
 *    gender of the currency.
 *
 * 2. **The conjunction «и».** It is not a separator — it appears exactly once per
 *    three-digit group, immediately before that group's last component, and is
 *    suppressed when that component is the first word of the whole number.
 *    That single rule produces every conventional form:
 *    `сто и едно`, `сто двадесет и едно`, `хиляда и сто`, `хиляда сто и едно`,
 *    `един милион двеста тридесет и четири хиляди петстотин шестдесет и седем`.
 *
 * 3. **The counting form.** After any numeral other than a bare 1 the noun takes
 *    its count form: `един лев` but `двадесет и един лева`.
 *
 * The fractional part is deliberately *not* spelled out. Bulgarian accounting
 * practice writes it as digits — `… и 50 ст.` — and doing the same avoids
 * inventing a convention nobody uses.
 */
import type { InvoiceLanguage } from './options'
import type { Currency } from './money'

import { toMinor } from './money'
import { DEFAULT_INVOICE_LANGUAGE } from './options'

type Gender = 'feminine' | 'masculine' | 'neuter'

/** 1 and 2 are the only numerals that inflect. */
const ONE: Record<Gender, string> = {
  feminine: 'една',
  masculine: 'един',
  neuter: 'едно',
}

const TWO: Record<Gender, string> = {
  feminine: 'две',
  masculine: 'два',
  neuter: 'две',
}

const UNITS = ['', '', '', 'три', 'четири', 'пет', 'шест', 'седем', 'осем', 'девет']

const TEENS = [
  'десет',
  'единадесет',
  'дванадесет',
  'тринадесет',
  'четиринадесет',
  'петнадесет',
  'шестнадесет',
  'седемнадесет',
  'осемнадесет',
  'деветнадесет',
]

const TENS = [
  '',
  '',
  'двадесет',
  'тридесет',
  'четиридесет',
  'петдесет',
  'шестдесет',
  'седемдесет',
  'осемдесет',
  'деветдесет',
]

/** Irregular enough that a table beats a rule. */
const HUNDREDS = [
  '',
  'сто',
  'двеста',
  'триста',
  'четиристотин',
  'петстотин',
  'шестстотин',
  'седемстотин',
  'осемстотин',
  'деветстотин',
]

const unitWord = (digit: number, gender: Gender): string => {
  if (digit === 1) {
    return ONE[gender]
  }

  if (digit === 2) {
    return TWO[gender]
  }

  return UNITS[digit]
}

/**
 * One three-digit group as its separate components — hundreds, tens, units —
 * with the empties dropped. Kept as a list rather than a string because the «и»
 * placement above needs to know where the group's last component starts.
 */
const groupComponents = (value: number, gender: Gender): string[] => {
  const components: string[] = []
  const hundreds = Math.floor(value / 100)
  const remainder = value % 100

  if (hundreds > 0) {
    components.push(HUNDREDS[hundreds])
  }

  // 10–19 are single words, so they cannot be split into a tens and a units
  // component the way 20–99 can.
  if (remainder >= 10 && remainder < 20) {
    components.push(TEENS[remainder - 10])

    return components
  }

  const tens = Math.floor(remainder / 10)
  const units = remainder % 10

  if (tens > 0) {
    components.push(TENS[tens])
  }

  if (units > 0) {
    components.push(unitWord(units, gender))
  }

  return components
}

/**
 * The scales, largest first. `gender` is the scale noun's own gender, which the
 * numeral in front of it has to agree with.
 *
 * `one` is the form used for a group of exactly 1 and `many` the counting form
 * for everything else. Thousands are the odd one out: `хиляда` stands alone
 * without a numeral, where the others take one (`един милион`).
 */
const SCALES: { divisor: number; gender: Gender; many: string; one: string }[] = [
  { divisor: 1_000_000_000, gender: 'masculine', many: 'милиарда', one: 'милиард' },
  { divisor: 1_000_000, gender: 'masculine', many: 'милиона', one: 'милион' },
  { divisor: 1_000, gender: 'feminine', many: 'хиляди', one: 'хиляда' },
]

/**
 * Insert «и» before the group's last component.
 *
 * `isFirstGroup` suppresses it when the group opens the number: `сто` on its own
 * never becomes `и сто`, while the same group after a higher scale does —
 * `хиляда и сто`. A group with more than one component always gets it, first or
 * not: `сто двадесет и едно`.
 */
const withConjunction = (components: string[], isFirstGroup: boolean): string[] => {
  if (components.length === 0) {
    return components
  }

  if (isFirstGroup && components.length === 1) {
    return components
  }

  const head = components.slice(0, -1)
  const last = components[components.length - 1]

  return [...head, 'и', last]
}

/**
 * A non-negative integer in Bulgarian words.
 *
 * `gender` applies to the final, sub-thousand group only — it is the gender of
 * whatever noun the number counts, which for our purposes is always the
 * currency. The scale groups carry their own.
 */
export const integerToWords = (value: number, gender: Gender = 'masculine'): string => {
  if (!Number.isFinite(value) || value < 0) {
    return ''
  }

  const whole = Math.floor(value)

  if (whole === 0) {
    return 'нула'
  }

  /** Every component of the whole number, in order, ready for «и» insertion. */
  const parts: string[] = []
  let remaining = whole

  for (const scale of SCALES) {
    const count = Math.floor(remaining / scale.divisor)

    if (count === 0) {
      continue
    }

    remaining %= scale.divisor

    // `хиляда`, not `една хиляда`.
    if (count === 1 && scale.divisor === 1_000) {
      parts.push(...withConjunction(groupComponents(0, scale.gender), parts.length === 0))
      parts.push(scale.one)

      continue
    }

    const components = groupComponents(count, scale.gender)
    const noun = count === 1 ? scale.one : scale.many

    // The scale noun rides on the group's last component rather than becoming a
    // component of its own, so that «и» lands before `четири хиляди` and not
    // between the numeral and its noun.
    components[components.length - 1] = `${components[components.length - 1]} ${noun}`

    parts.push(...withConjunction(components, parts.length === 0))
  }

  if (remaining > 0) {
    parts.push(...withConjunction(groupComponents(remaining, gender), parts.length === 0))
  }

  return parts.join(' ')
}

/**
 * The Bulgarian currency nouns, with the gender their numerals agree with.
 *
 * Only the two currencies an invoice from Bulgaria is realistically denominated in
 * are here. `null` for the rest is not a gap to be filled later: spelling a dollar
 * total out in Bulgarian is not a convention that exists, and the caller renders
 * nothing rather than guessing. The English table below has all four, because
 * there the convention is unambiguous.
 */
const BG_CURRENCY_WORDS: Partial<
  Record<Currency, { gender: Gender; many: string; one: string; subMany: string; subOne: string }>
> = {
  BGN: {
    gender: 'masculine',
    many: 'лева',
    one: 'лев',
    subMany: 'стотинки',
    subOne: 'стотинка',
  },
  // `евро` is neuter and does not decline, so `one` and `many` coincide —
  // `едно евро`, `две евро`, `сто евро`.
  EUR: {
    gender: 'neuter',
    many: 'евро',
    one: 'евро',
    subMany: 'цента',
    subOne: 'цент',
  },
}

/**
 * The English numerals. No gender, so one flat table each.
 *
 * 0 and 1 are placeholders in `EN_TENS` for the same reason the Bulgarian tables
 * carry them: the index is the digit, and 10–19 are handled by their own table.
 */
const EN_UNITS = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
]

const EN_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
]

const EN_SCALES: { divisor: number; noun: string }[] = [
  { divisor: 1_000_000_000, noun: 'billion' },
  { divisor: 1_000_000, noun: 'million' },
  { divisor: 1_000, noun: 'thousand' },
]

/** 1–99, hyphenated above twenty: `twenty-one`, not `twenty one`. */
const enBelowHundred = (value: number): string => {
  if (value < 20) {
    return EN_UNITS[value]
  }

  const tens = EN_TENS[Math.floor(value / 10)]
  const units = value % 10

  return units === 0 ? tens : `${tens}-${EN_UNITS[units]}`
}

/** 1–999, with the "and" British usage puts before the tens: `one hundred and one`. */
const enBelowThousand = (value: number): string => {
  const hundreds = Math.floor(value / 100)
  const remainder = value % 100

  if (hundreds === 0) {
    return enBelowHundred(remainder)
  }

  const head = `${EN_UNITS[hundreds]} hundred`

  return remainder === 0 ? head : `${head} and ${enBelowHundred(remainder)}`
}

/**
 * A non-negative integer in English words.
 *
 * British usage throughout, including the "and" — `one thousand and five`, not the
 * American `one thousand five`. That "and" appears only when the trailing part is
 * under a hundred; above that, `enBelowThousand` has already placed its own, which
 * is why `1101` is `one thousand one hundred and one` and not `one thousand and
 * one hundred and one`.
 */
export const integerToWordsEn = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) {
    return ''
  }

  const whole = Math.floor(value)

  if (whole === 0) {
    return 'zero'
  }

  const parts: string[] = []
  let remaining = whole

  for (const scale of EN_SCALES) {
    const count = Math.floor(remaining / scale.divisor)

    if (count === 0) {
      continue
    }

    remaining %= scale.divisor
    parts.push(`${enBelowThousand(count)} ${scale.noun}`)
  }

  if (remaining > 0) {
    parts.push(
      parts.length > 0 && remaining < 100
        ? `and ${enBelowHundred(remaining)}`
        : enBelowThousand(remaining),
    )
  }

  return parts.join(' ')
}

/**
 * The English currency nouns.
 *
 * All four currencies, unlike the Bulgarian table: `two hundred dollars and 50
 * cents` is ordinary English, where the Bulgarian equivalent for a dollar total is
 * not an established form. Note `leva` — the English plural of the lev is the
 * Bulgarian counting form, not `levs` — and `pence`, which is not `pennies` when
 * counting money.
 */
const EN_CURRENCY_WORDS: Record<
  Currency,
  { many: string; one: string; subMany: string; subOne: string }
> = {
  BGN: { many: 'leva', one: 'lev', subMany: 'stotinki', subOne: 'stotinka' },
  EUR: { many: 'euros', one: 'euro', subMany: 'cents', subOne: 'cent' },
  GBP: { many: 'pounds', one: 'pound', subMany: 'pence', subOne: 'penny' },
  USD: { many: 'dollars', one: 'dollar', subMany: 'cents', subOne: 'cent' },
}

/**
 * A money amount as the "in words" line: words for the whole units, digits for the
 * subunits.
 *
 * The digits for the fractional part are deliberate and shared by both languages —
 * `… и 50 ст.` and `… and 50 cents` are both how the convention is actually
 * written, and spelling out `fifty` there would be inventing a form nobody uses.
 *
 * Returns `null` when the language has no established form for the currency, which
 * the invoice template reads as "omit the line".
 *
 * The split is taken from the minor-unit value rather than from `Math.floor` and a
 * modulo on the decimal, so an amount that arrives as `1200.4999999` spells out the
 * same total the invoice prints.
 */
export const amountToWords = (
  amount: number,
  currency: Currency,
  language: InvoiceLanguage = DEFAULT_INVOICE_LANGUAGE,
): null | string => {
  if (!Number.isFinite(amount) || amount < 0) {
    return null
  }

  const minor = toMinor(amount)
  const whole = Math.floor(minor / 100)
  const fraction = minor % 100
  const padded = String(fraction).padStart(2, '0')

  if (language === 'en') {
    const words = EN_CURRENCY_WORDS[currency]

    const unitNoun = whole === 1 ? words.one : words.many
    const subNoun = fraction === 1 ? words.subOne : words.subMany

    return `${integerToWordsEn(whole)} ${unitNoun} and ${padded} ${subNoun}`
  }

  const words = BG_CURRENCY_WORDS[currency]

  if (!words) {
    return null
  }

  const unitNoun = whole === 1 ? words.one : words.many
  const subNoun = fraction === 1 ? words.subOne : words.subMany

  return `${integerToWords(whole, words.gender)} ${unitNoun} и ${padded} ${subNoun}`
}
