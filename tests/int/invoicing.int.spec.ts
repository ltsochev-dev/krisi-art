/**
 * @vitest-environment node
 *
 * Payload is server-only; the project's default jsdom environment breaks it.
 *
 * These run against the configured DATABASE_URL. Every client created here is
 * namespaced with `PREFIX` and removed in `afterAll`.
 *
 * The `invoice-settings` global needs more care than that. It is a global, so
 * there is only one of it and the tests have to write to it — the numbering
 * sequence and the seller identity live there. It is therefore snapshotted in
 * `beforeAll` and restored in `afterAll`, including the explicit nulls, so a run
 * against a configured database leaves the developer's own settings and their
 * place in the sequence exactly as they were.
 *
 * The one case that snapshot cannot express is a database where the global has
 * never been saved: there is no way to un-create a global, and its required fields
 * refuse an empty one. That case is restored to `UNCONFIGURED` below — a
 * placeholder that reads as a prompt, rather than leaving a test fixture sitting
 * where the artist's legal name belongs.
 *
 * Teardown deletes invoices through `payload.db` rather than `payload.delete`,
 * because `guardInvoiceDelete` exists precisely to refuse the latter for an
 * issued invoice. That refusal is itself asserted below.
 */
import type { Client, Invoice } from '@/payload-types'

import { getPayload, type Payload, type RequiredDataFromCollectionSlug } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { findInvoiceByUuid } from '@/lib/content/invoices'
import { amountToWords, integerToWords, integerToWordsEn } from '@/lib/invoicing/words'
import { formatInvoiceDate, formatQuantity, formatRate } from '@/lib/invoicing/labels'
import { computeInvoiceTotals } from '@/lib/invoicing/totals'
import { convertToBase, formatMoney, lineTotalMinor } from '@/lib/invoicing/money'
import {
  formatInvoiceNumber,
  INVOICE_NUMBER_LENGTH,
  parseInvoiceNumber,
} from '@/lib/invoicing/numbering'
import { canTransition } from '@/lib/invoicing/status'
import config from '@/payload.config'

const PREFIX = 'zz-int-test'

/**
 * High enough that the padded numbers these tests mint cannot collide with a real
 * sequence in a development database, and low enough to leave room above.
 */
const SEQUENCE_START = 900_000

let payload: Payload
let client: Client
let archivedClient: Client
/** Snapshot of the settings global, restored in `afterAll`. */
let originalSettings: Record<string, unknown>
/** Whether that snapshot came from a real saved global or from the field defaults. */
let settingsExisted: boolean

/**
 * What the settings global is left as when the tests found it unsaved. Visibly not
 * data, so it cannot be mistaken for a configured issuer.
 */
const UNCONFIGURED = {
  address: '— настройте / configure —',
  city: '— настройте / configure —',
  country: 'България',
  identifier: '—',
  legalName: '— настройте / configure —',
}

/**
 * A minimal draft. The cast is because spreading a partial over the literal makes
 * TypeScript treat the collection's required fields as optional, and `versions`
 * being enabled means the create overload then matches only the `draft: true`
 * branch — which this module never uses.
 */
const draftInvoice = async (
  overrides: Partial<RequiredDataFromCollectionSlug<'invoices'>> = {},
): Promise<Invoice> =>
  await payload.create({
    collection: 'invoices',
    data: {
      client: client.id,
      currency: 'EUR',
      issueDate: '2026-03-01T00:00:00.000Z',
      items: [
        { description: `${PREFIX} illustration`, quantity: 1, unit: 'piece', unitPrice: 500 },
      ],
      ...overrides,
    } as RequiredDataFromCollectionSlug<'invoices'>,
    overrideAccess: true,
  })

describe('invoicing', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })

    const existing = await payload.findGlobal({
      slug: 'invoice-settings',
      depth: 0,
      overrideAccess: true,
    })

    // A global that has never been saved comes back as its field defaults with no
    // timestamp, which is what distinguishes the two restore paths.
    settingsExisted = Boolean(existing.updatedAt)
    originalSettings = existing as unknown as Record<string, unknown>

    await payload.updateGlobal({
      slug: 'invoice-settings',
      data: {
        bank: { bic: 'BUINBGSF', iban: 'BG80BNBG96611020345678', name: `${PREFIX} Bank` },
        defaults: { currency: 'EUR', paymentTermsDays: 14, placeOfIssue: 'София' },
        legalNote: 'Не се начислява ДДС на основание чл. 113, ал. 9 от ЗДДС.',
        legalNoteEn: 'VAT is not charged pursuant to Art. 113(9) of the Bulgarian VAT Act.',
        numbering: { nextNumber: SEQUENCE_START },
        seller: {
          address: 'ул. Тест 1',
          city: 'София',
          country: 'България',
          identifier: '1234567890',
          legalName: `${PREFIX} Kristina`,
        },
      },
      depth: 0,
      overrideAccess: true,
    })

    client = await payload.create({
      collection: 'clients',
      data: {
        address: 'бул. Клиент 5',
        city: 'Пловдив',
        country: 'България',
        eik: '9876543210',
        kind: 'company',
        name: `${PREFIX} Client OOD`,
        responsiblePerson: 'Иван Иванов',
      },
      overrideAccess: true,
    })

    archivedClient = await payload.create({
      collection: 'clients',
      data: {
        address: 'ул. Архив 2',
        archived: true,
        city: 'Варна',
        country: 'България',
        kind: 'individual',
        name: `${PREFIX} Archived Person`,
      },
      overrideAccess: true,
    })
  })

  afterAll(async () => {
    const { docs } = await payload.find({
      collection: 'invoices',
      depth: 0,
      limit: 0,
      overrideAccess: true,
      pagination: false,
      where: { client: { in: [client.id, archivedClient.id] } },
    })

    for (const invoice of docs) {
      await payload.db.deleteVersions({
        collection: 'invoices',
        where: { parent: { equals: invoice.id } },
      })
    }

    await payload.db.deleteMany({
      collection: 'invoices',
      where: { client: { in: [client.id, archivedClient.id] } },
    })

    await payload.delete({
      collection: 'clients',
      overrideAccess: true,
      where: { name: { like: PREFIX } },
    })

    await payload.updateGlobal({
      slug: 'invoice-settings',
      // The snapshot carries explicit nulls, so restoring it clears fields these
      // tests set as well as resetting the ones they changed.
      data: settingsExisted ? originalSettings : { ...originalSettings, seller: UNCONFIGURED },
      depth: 0,
      overrideAccess: true,
    })
  })

  // --- Pure arithmetic -----------------------------------------------------

  describe('money', () => {
    it('sums lines in minor units so the parts match the whole', () => {
      // The classic float trap: 0.1 + 0.2 is 0.30000000000000004, and three lines
      // of 0.10 must total exactly 0.30.
      const totals = computeInvoiceTotals({
        currency: 'EUR',
        items: [
          { quantity: 1, unitPrice: 0.1 },
          { quantity: 1, unitPrice: 0.1 },
          { quantity: 1, unitPrice: 0.1 },
        ],
      })

      expect(totals.subtotal).toBe(0.3)
      expect(totals.total).toBe(0.3)
      expect(totals.lineTotals).toEqual([0.1, 0.1, 0.1])
    })

    it('multiplies fractional quantities and rounds once', () => {
      expect(lineTotalMinor(80, 2.5)).toBe(20_000)
      expect(lineTotalMinor(33.33, 3)).toBe(9999)
    })

    it('takes the discount off the subtotal as one rounded amount', () => {
      const totals = computeInvoiceTotals({
        currency: 'EUR',
        discountPercent: 10,
        items: [{ quantity: 3, unitPrice: 33.33 }],
      })

      expect(totals.subtotal).toBe(99.99)
      expect(totals.discountAmount).toBe(10)
      expect(totals.total).toBe(89.99)
    })

    it('clamps a nonsensical discount rather than producing a negative total', () => {
      expect(
        computeInvoiceTotals({ discountPercent: 400, items: [{ quantity: 1, unitPrice: 100 }] })
          .total,
      ).toBe(0)
      expect(
        computeInvoiceTotals({ discountPercent: -50, items: [{ quantity: 1, unitPrice: 100 }] })
          .total,
      ).toBe(100)
    })

    it('restates a foreign-currency total only when a usable rate is given', () => {
      expect(
        computeInvoiceTotals({
          currency: 'USD',
          exchangeRate: 1.1,
          items: [{ quantity: 1, unitPrice: 110 }],
        }).baseTotal,
      ).toBe(100)

      // No rate, a zero rate and an EUR invoice all mean "nothing to restate".
      expect(convertToBase(110, null)).toBeNull()
      expect(convertToBase(110, 0)).toBeNull()
      expect(
        computeInvoiceTotals({ currency: 'EUR', exchangeRate: 1.1, items: [] }).baseTotal,
      ).toBeNull()
    })

    it('formats amounts the Bulgarian way, grouping every thousand', () => {
      // Normalised because the locale separates with a non-breaking space, and
      // asserted at 1 200 specifically: that is the magnitude bg-BG would leave
      // ungrouped by default.
      expect(formatMoney(1200.5, 'EUR').replace(/\s/g, ' ')).toBe('1 200,50 EUR')
      expect(formatMoney(12500, 'EUR').replace(/\s/g, ' ')).toBe('12 500,00 EUR')
    })

    it('names the currency by its ISO code, not the Bulgarian symbol', () => {
      // `bg-BG` would render USD as `щ.д.`, which the client receiving a
      // dollar invoice cannot read.
      expect(formatMoney(250, 'USD').replace(/\s/g, ' ')).toBe('250,00 USD')
      expect(formatMoney(250, 'BGN').replace(/\s/g, ' ')).toBe('250,00 BGN')
    })
  })

  describe('amount in words, Bulgarian', () => {
    it('places «и» before the last component of each group', () => {
      expect(integerToWords(100)).toBe('сто')
      expect(integerToWords(101)).toBe('сто и един')
      expect(integerToWords(121)).toBe('сто двадесет и един')
      expect(integerToWords(1000)).toBe('хиляда')
      expect(integerToWords(1100)).toBe('хиляда и сто')
      expect(integerToWords(1101)).toBe('хиляда сто и един')
      expect(integerToWords(1_234_567)).toBe(
        'един милион двеста тридесет и четири хиляди петстотин шестдесет и седем',
      )
    })

    it('agrees the numeral with the currency’s gender', () => {
      expect(amountToWords(1, 'EUR')).toBe('едно евро и 00 цента')
      expect(amountToWords(1, 'BGN')).toBe('един лев и 00 стотинки')
      expect(amountToWords(2, 'BGN')).toBe('два лева и 00 стотинки')
      expect(amountToWords(1250.5, 'EUR')).toBe('хиляда двеста и петдесет евро и 50 цента')
    })

    it('spells the subunit singular for exactly one', () => {
      expect(amountToWords(0.01, 'BGN')).toBe('нула лева и 01 стотинка')
    })

    it('declines to invent a convention for other currencies', () => {
      // There is no established Bulgarian form for spelling out a dollar total,
      // and the template omits the line rather than inventing one. English, which
      // does have one for all four, is covered below.
      expect(amountToWords(100, 'USD', 'bg')).toBeNull()
      expect(amountToWords(100, 'GBP', 'bg')).toBeNull()
    })

    it('is what an invoice with no language set falls back to', () => {
      expect(amountToWords(1, 'EUR')).toBe(amountToWords(1, 'EUR', 'bg'))
    })
  })

  describe('amount in words, English', () => {
    it('hyphenates above twenty and places "and" the British way', () => {
      expect(integerToWordsEn(21)).toBe('twenty-one')
      expect(integerToWordsEn(100)).toBe('one hundred')
      expect(integerToWordsEn(101)).toBe('one hundred and one')
      expect(integerToWordsEn(121)).toBe('one hundred and twenty-one')
      expect(integerToWordsEn(1000)).toBe('one thousand')
      // "and" only before a trailing part under a hundred; above that the
      // hundreds group has already placed its own.
      expect(integerToWordsEn(1005)).toBe('one thousand and five')
      expect(integerToWordsEn(1100)).toBe('one thousand one hundred')
      expect(integerToWordsEn(1101)).toBe('one thousand one hundred and one')
      expect(integerToWordsEn(1_234_567)).toBe(
        'one million two hundred and thirty-four thousand five hundred and sixty-seven',
      )
    })

    it('covers all four currencies, with their real plurals', () => {
      expect(amountToWords(1900.5, 'EUR', 'en')).toBe(
        'one thousand nine hundred euros and 50 cents',
      )
      // The English plural of the lev is `leva`, not `levs`.
      expect(amountToWords(2, 'BGN', 'en')).toBe('two leva and 00 stotinki')
      expect(amountToWords(2, 'USD', 'en')).toBe('two dollars and 00 cents')
      // And pence, not pennies, when counting money.
      expect(amountToWords(2.5, 'GBP', 'en')).toBe('two pounds and 50 pence')
    })

    it('spells the subunit singular for exactly one', () => {
      expect(amountToWords(1.01, 'EUR', 'en')).toBe('one euro and 01 cent')
      expect(amountToWords(1.01, 'GBP', 'en')).toBe('one pound and 01 penny')
    })
  })

  describe('formatting per language', () => {
    it('avoids the ambiguous all-digit date in English', () => {
      // `03.09.2026` is the third of September to a European reader and the ninth
      // of March to an American one, which is not a thing to leave open on a due
      // date.
      expect(formatInvoiceDate('2026-09-03T00:00:00.000Z', 'bg')).toBe('03.09.2026')
      // `Sept`, with the t: that is `en-GB`'s abbreviation, and September is the
      // only month where it differs from the three-letter American form.
      expect(formatInvoiceDate('2026-09-03T00:00:00.000Z', 'en')).toBe('3 Sept 2026')
      expect(formatInvoiceDate('2026-03-09T00:00:00.000Z', 'en')).toBe('9 Mar 2026')
    })

    it('reads the stored timestamp in UTC, not the machine timezone', () => {
      // Midnight UTC must not print as the previous day west of Greenwich.
      expect(formatInvoiceDate('2026-03-01T00:00:00.000Z', 'bg')).toBe('01.03.2026')
    })

    it('returns null for a missing or unparseable date', () => {
      expect(formatInvoiceDate(null, 'bg')).toBeNull()
      expect(formatInvoiceDate('not a date', 'bg')).toBeNull()
    })

    it('switches the decimal separator with the language', () => {
      expect(formatQuantity(2.5, 'bg')).toBe('2,5')
      expect(formatQuantity(2.5, 'en')).toBe('2.5')
      expect(formatRate(1.9558, 'bg')).toBe('1,9558')
      expect(formatRate(1.9558, 'en')).toBe('1.9558')
    })
  })

  describe('numbering format', () => {
    it('pads to ten digits per чл. 78 ППЗДДС', () => {
      expect(formatInvoiceNumber(1)).toBe('0000000001')
      expect(formatInvoiceNumber(247)).toBe('0000000247')
      expect(formatInvoiceNumber(1).length).toBe(INVOICE_NUMBER_LENGTH)
    })

    it('sorts lexicographically in numeric order, which is what the allocator relies on', () => {
      const sorted = [9, 100, 1].map(formatInvoiceNumber).sort()

      expect(sorted.map(parseInvoiceNumber)).toEqual([1, 9, 100])
    })

    it('rejects anything that is not a sequence value', () => {
      expect(parseInvoiceNumber(null)).toBeNull()
      expect(parseInvoiceNumber('')).toBeNull()
      expect(parseInvoiceNumber('abc')).toBeNull()
    })
  })

  describe('status transitions', () => {
    it('never allows a return to draft', () => {
      expect(canTransition('issued', 'draft')).toBe(false)
      expect(canTransition('paid', 'draft')).toBe(false)
      expect(canTransition('cancelled', 'draft')).toBe(false)
    })

    it('treats cancelled as terminal but paid as reversible', () => {
      expect(canTransition('cancelled', 'issued')).toBe(false)
      expect(canTransition('paid', 'issued')).toBe(true)
    })
  })

  // --- Documents -----------------------------------------------------------

  describe('drafts', () => {
    it('gets a UUID and no invoice number, with totals computed', async () => {
      const invoice = await draftInvoice({
        items: [
          { description: `${PREFIX} cover art`, quantity: 2.5, unit: 'hour', unitPrice: 80 },
          { description: `${PREFIX} revisions`, quantity: 1, unit: 'project', unitPrice: 120 },
        ],
      })

      expect(invoice.uuid).toMatch(/^[0-9a-f-]{36}$/)
      expect(invoice.invoiceNumber).toBeFalsy()
      expect(invoice.status).toBe('draft')
      expect(invoice.items?.map((row) => row.total)).toEqual([200, 120])
      expect(invoice.subtotal).toBe(320)
      expect(invoice.total).toBe(320)
      expect(invoice.totalInWords).toBe('триста и двадесет евро и 00 цента')
    })

    it('can be saved with no line items, and refuses to be issued that way', async () => {
      const invoice = await draftInvoice({ items: [] })

      expect(invoice.total).toBe(0)

      await expect(
        payload.update({
          collection: 'invoices',
          data: { status: 'issued' },
          id: invoice.id,
          overrideAccess: true,
        }),
      ).rejects.toThrow(/at least one line item/i)
    })

    it('recomputes totals on edit', async () => {
      const invoice = await draftInvoice()

      const updated = await payload.update({
        collection: 'invoices',
        data: { discountPercent: 25 },
        id: invoice.id,
        overrideAccess: true,
      })

      expect(updated.subtotal).toBe(500)
      expect(updated.discountAmount).toBe(125)
      expect(updated.total).toBe(375)
    })

    it('is renderable at its UUID, from live records', async () => {
      const invoice = await draftInvoice()
      const rendered = await findInvoiceByUuid({ payload, uuid: invoice.uuid! })

      expect(rendered?.isDraft).toBe(true)
      expect(rendered?.invoiceNumber).toBeNull()
      // Live, not frozen — the draft has no snapshot to read.
      expect(rendered?.billTo.name).toBe(client.name)
      expect(rendered?.seller.identifier).toBe('1234567890')
      expect(rendered?.paymentMethod).toBe('Банков превод')
    })

    it('defaults to the language in settings, and respells the total when changed', async () => {
      const invoice = await draftInvoice({
        items: [{ description: `${PREFIX} portrait`, quantity: 1, unitPrice: 1900 }],
      })

      // `defaults.language` is unset in the fixture, so the field default applies.
      expect(invoice.language).toBe('bg')
      expect(invoice.totalInWords).toBe('хиляда и деветстотин евро и 00 цента')

      const english = await payload.update({
        collection: 'invoices',
        data: { language: 'en' },
        id: invoice.id,
        overrideAccess: true,
      })

      // `totalInWords` is stored, so switching the language has to rewrite it
      // rather than leave a Bulgarian line on an English invoice.
      expect(english.totalInWords).toBe('one thousand nine hundred euros and 00 cents')
    })

    it('renders its labels and units in its own language', async () => {
      const bulgarian = await draftInvoice({
        items: [{ description: `${PREFIX} sketch`, quantity: 2, unit: 'hour', unitPrice: 80 }],
      })
      const english = await draftInvoice({
        language: 'en',
        items: [{ description: `${PREFIX} sketch`, quantity: 2, unit: 'hour', unitPrice: 80 }],
      })

      const bg = await findInvoiceByUuid({ payload, uuid: bulgarian.uuid! })
      const en = await findInvoiceByUuid({ payload, uuid: english.uuid! })

      expect(bg?.language).toBe('bg')
      expect(bg?.lines[0]?.unit).toBe('час')
      expect(bg?.paymentMethod).toBe('Банков превод')

      expect(en?.language).toBe('en')
      expect(en?.lines[0]?.unit).toBe('hour')
      expect(en?.paymentMethod).toBe('Bank transfer')
    })

    it('takes the legal note in its own language', async () => {
      const bulgarian = await draftInvoice()
      const english = await draftInvoice({ language: 'en' })

      const bg = await findInvoiceByUuid({ payload, uuid: bulgarian.uuid! })
      const en = await findInvoiceByUuid({ payload, uuid: english.uuid! })

      expect(bg?.seller.legalNote).toMatch(/чл\. 113, ал\. 9/)
      expect(en?.seller.legalNote).toMatch(/Art\. 113\(9\)/)
    })

    it('can be deleted, having no number and no legal weight', async () => {
      const invoice = await draftInvoice()

      await payload.delete({ collection: 'invoices', id: invoice.id, overrideAccess: true })

      expect(
        await payload.find({
          collection: 'invoices',
          overrideAccess: true,
          where: { id: { equals: invoice.id } },
        }),
      ).toMatchObject({ totalDocs: 0 })
    })
  })

  describe('issuing', () => {
    let issued: Invoice

    beforeAll(async () => {
      const draft = await draftInvoice({
        items: [
          { description: `${PREFIX} portrait`, quantity: 1, unit: 'piece', unitPrice: 1250.5 },
        ],
      })

      issued = await payload.update({
        collection: 'invoices',
        data: { status: 'issued' },
        id: draft.id,
        overrideAccess: true,
      })
    })

    it('takes its number from the configured sequence, zero-padded', () => {
      expect(issued.invoiceNumber).toBe(formatInvoiceNumber(SEQUENCE_START))
    })

    it('advances the sequence on the settings global', async () => {
      const settings = await payload.findGlobal({
        slug: 'invoice-settings',
        depth: 0,
        overrideAccess: true,
      })

      expect(settings.numbering?.nextNumber).toBeGreaterThan(SEQUENCE_START)
    })

    it('freezes both parties onto the document', () => {
      expect(issued.seller?.legalName).toBe(`${PREFIX} Kristina`)
      expect(issued.seller?.iban).toBe('BG80BNBG96611020345678')
      // Resolved to the invoice's language before it was frozen, not stored as a
      // pair for the template to choose from later.
      expect(issued.seller?.legalNote).toMatch(/чл\. 113, ал\. 9/)
      expect(issued.billTo?.name).toBe(client.name)
      expect(issued.billTo?.eik).toBe('9876543210')
      expect(issued.billTo?.responsiblePerson).toBe('Иван Иванов')
    })

    it('fills the due date from the payment terms', () => {
      // 1 March plus fourteen days.
      expect(issued.dueDate?.slice(0, 10)).toBe('2026-03-15')
    })

    it('ignores later edits to the client record', async () => {
      await payload.update({
        collection: 'clients',
        data: { city: 'Бургас' },
        id: client.id,
        overrideAccess: true,
      })

      const reread = await payload.findByID({
        collection: 'invoices',
        id: issued.id,
        overrideAccess: true,
      })

      expect(reread.billTo?.city).toBe('Пловдив')

      const rendered = await findInvoiceByUuid({ payload, uuid: issued.uuid! })

      expect(rendered?.isDraft).toBe(false)
      expect(rendered?.billTo.city).toBe('Пловдив')

      await payload.update({
        collection: 'clients',
        data: { city: 'Пловдив' },
        id: client.id,
        overrideAccess: true,
      })
    })

    it('discards writes to everything that prints, even through the Local API', async () => {
      const tampered = await payload.update({
        collection: 'invoices',
        data: {
          currency: 'USD',
          discountPercent: 90,
          invoiceNumber: '0000000001',
          items: [{ description: 'tampered', quantity: 99, unit: 'piece', unitPrice: 1 }],
          // The language is part of what prints, so it freezes with the rest —
          // an invoice already sent to a client must not change language.
          language: 'en',
          notes: 'tampered',
          total: 1,
        },
        id: issued.id,
        // The strongest case: access control is off entirely, so only the hooks
        // stand between this and the stored document.
        overrideAccess: true,
      })

      expect(tampered.invoiceNumber).toBe(issued.invoiceNumber)
      expect(tampered.currency).toBe('EUR')
      expect(tampered.language).toBe('bg')
      expect(tampered.total).toBe(1250.5)
      expect(tampered.discountPercent).toBeFalsy()
      expect(tampered.items?.[0]?.description).toContain('portrait')
      expect(tampered.notes).toBe(issued.notes)
    })

    it('still accepts the parts of the lifecycle that are meant to move', async () => {
      const paid = await payload.update({
        collection: 'invoices',
        data: { internalNotes: 'paid by transfer', status: 'paid' },
        id: issued.id,
        overrideAccess: true,
      })

      expect(paid.status).toBe('paid')
      expect(paid.paidDate).toBeTruthy()
      expect(paid.internalNotes).toBe('paid by transfer')

      // Walking it back clears the payment date rather than leaving a stale one.
      const reopened = await payload.update({
        collection: 'invoices',
        data: { status: 'sent' },
        id: issued.id,
        overrideAccess: true,
      })

      expect(reopened.paidDate).toBeFalsy()
    })

    it('refuses to go back to draft', async () => {
      await expect(
        payload.update({
          collection: 'invoices',
          data: { status: 'draft' },
          id: issued.id,
          overrideAccess: true,
        }),
      ).rejects.toThrow(/cannot go from/i)
    })

    it('refuses to be deleted', async () => {
      await expect(
        payload.delete({ collection: 'invoices', id: issued.id, overrideAccess: true }),
      ).rejects.toThrow(/cannot be deleted/i)
    })

    it('records every change as a version', async () => {
      const { totalDocs } = await payload.findVersions({
        collection: 'invoices',
        depth: 0,
        overrideAccess: true,
        where: { parent: { equals: issued.id } },
      })

      // Created, issued, then the edits above — the history tab is not empty.
      expect(totalDocs).toBeGreaterThan(2)
    })

    it('freezes the English note when issued in English', async () => {
      const draft = await draftInvoice({ language: 'en' })

      const englishInvoice = await payload.update({
        collection: 'invoices',
        data: { status: 'issued' },
        id: draft.id,
        overrideAccess: true,
      })

      expect(englishInvoice.seller?.legalNote).toMatch(/Art\. 113\(9\)/)
      expect(englishInvoice.totalInWords).toMatch(/^five hundred euros/)
    })

    it('gives the next invoice whatever the sequence is currently pointing at', async () => {
      // Read the counter rather than assuming a position: other tests in this
      // block issue invoices too, and an assertion on `SEQUENCE_START + 1` would
      // break every time one is added above.
      const before = await payload.findGlobal({
        slug: 'invoice-settings',
        depth: 0,
        overrideAccess: true,
      })

      const draft = await draftInvoice()

      const next = await payload.update({
        collection: 'invoices',
        data: { status: 'issued' },
        id: draft.id,
        overrideAccess: true,
      })

      expect(next.invoiceNumber).toBe(formatInvoiceNumber(before.numbering!.nextNumber))

      const after = await payload.findGlobal({
        slug: 'invoice-settings',
        depth: 0,
        overrideAccess: true,
      })

      expect(after.numbering?.nextNumber).toBe(before.numbering!.nextNumber + 1)
    })

    it('does not consume a number when issuing fails', async () => {
      const before = await payload.findGlobal({
        slug: 'invoice-settings',
        depth: 0,
        overrideAccess: true,
      })

      const empty = await draftInvoice({ items: [] })

      await expect(
        payload.update({
          collection: 'invoices',
          data: { status: 'issued' },
          id: empty.id,
          overrideAccess: true,
        }),
      ).rejects.toThrow()

      const after = await payload.findGlobal({
        slug: 'invoice-settings',
        depth: 0,
        overrideAccess: true,
      })

      expect(after.numbering?.nextNumber).toBe(before.numbering?.nextNumber)
    })
  })

  describe('clients', () => {
    it('cannot be deleted while they have invoices', async () => {
      await expect(
        payload.delete({ collection: 'clients', id: client.id, overrideAccess: true }),
      ).rejects.toThrow(/cannot be deleted/i)
    })

    it('can be archived instead, which leaves their invoices alone', async () => {
      const invoice = await draftInvoice({ client: archivedClient.id })

      // `create` returns at depth 2, so the relationship comes back populated.
      expect(typeof invoice.client === 'object' && invoice.client.id).toBe(archivedClient.id)
    })
  })
})
