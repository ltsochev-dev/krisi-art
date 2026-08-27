/**
 * Frozen copies of the seller and the client, taken at the moment an invoice is
 * issued.
 *
 * This is the part of the module that is easy to leave out and expensive to add
 * later. An invoice is a statement about who two parties were on a particular
 * date. If the printed document read its addresses live off the `clients`
 * collection and the `invoice-settings` global, then a client moving office, or
 * the artist correcting a typo in their own BULSTAT, would silently rewrite every
 * invoice ever issued to them — including ones already filed with an accountant.
 * Under the Bulgarian Accounting Act that document is supposed to be immutable,
 * and a live join makes it anything but.
 *
 * So: while an invoice is a draft it renders live data (which is what makes the
 * draft a useful preview), and on issuing, both parties' details are copied onto
 * the invoice row and locked. From then on the snapshot is what prints.
 *
 * The logo and signature images are the exception, and stay live off the settings
 * global. They are branding rather than legal identity, the artist has exactly
 * one of each, and pinning a media relation per invoice would keep old files
 * undeletable forever.
 *
 * Both mappers are deliberately structural rather than typed against
 * `@/payload-types`: they take the shape they need and nothing more, which keeps
 * them unit-testable without booting Payload.
 */
import type { PayloadRequest } from 'payload'

import type { InvoiceLanguage } from './options'

import { DEFAULT_INVOICE_LANGUAGE } from './options'

/** What the mappers need off the `invoice-settings` global. */
type SellerSource = {
  bank?: { bic?: null | string; iban?: null | string; name?: null | string } | null
  legalNote?: null | string
  legalNoteEn?: null | string
  seller?: {
    activity?: null | string
    address?: null | string
    city?: null | string
    country?: null | string
    email?: null | string
    identifier?: null | string
    legalName?: null | string
    phone?: null | string
    postalCode?: null | string
    website?: null | string
  } | null
}

/** What the mappers need off a `clients` document. */
type ClientSource = {
  address?: null | string
  city?: null | string
  country?: null | string
  eik?: null | string
  email?: null | string
  kind?: null | string
  name?: null | string
  postalCode?: null | string
  responsiblePerson?: null | string
  vatNumber?: null | string
}

export type SellerSnapshot = {
  activity: null | string
  address: null | string
  bankName: null | string
  bic: null | string
  city: null | string
  country: null | string
  email: null | string
  iban: null | string
  identifier: null | string
  legalName: null | string
  legalNote: null | string
  phone: null | string
  postalCode: null | string
  website: null | string
}

export type BillToSnapshot = {
  address: null | string
  city: null | string
  country: null | string
  eik: null | string
  email: null | string
  kind: null | string
  name: null | string
  postalCode: null | string
  responsiblePerson: null | string
  vatNumber: null | string
}

/** Empty strings become `null`, so a blank field renders as absent rather than as a stray colon. */
const text = (value: null | string | undefined): null | string => {
  const trimmed = value?.trim()

  return trimmed ? trimmed : null
}

/**
 * The seller's details, with the legal note resolved to the invoice's language.
 *
 * The note is the one piece of settings-level *prose* that reaches the printed
 * page — everything else the artist types there is a name, an address or an
 * account number, which is written the way its own postal or banking system
 * expects rather than translated. A sentence explaining a tax position is
 * different: on an invoice printed in English it has to be readable in English,
 * and the artist has no per-invoice field to override it with. Hence two fields on
 * the global and this parameter, rather than one note in whichever language the
 * artist happened to write it in.
 *
 * The snapshot itself keeps a single `legalNote`, because by the time it is written
 * the language is already decided and only one of the two can ever print.
 */
export const toSellerSnapshot = (
  settings: SellerSource,
  language: InvoiceLanguage = DEFAULT_INVOICE_LANGUAGE,
): SellerSnapshot => ({
  activity: text(settings.seller?.activity),
  address: text(settings.seller?.address),
  bankName: text(settings.bank?.name),
  bic: text(settings.bank?.bic),
  city: text(settings.seller?.city),
  country: text(settings.seller?.country),
  email: text(settings.seller?.email),
  iban: text(settings.bank?.iban),
  identifier: text(settings.seller?.identifier),
  legalName: text(settings.seller?.legalName),
  // Frozen with the rest: the чл. 113, ал. 9 note is a statement about the
  // seller's tax position on the issue date, so a later edit to the wording
  // must not reach back into issued documents. Falls back to the Bulgarian when
  // the English has been left blank — a note in the wrong language still beats a
  // document that makes no statement about VAT at all.
  legalNote:
    language === 'en'
      ? (text(settings.legalNoteEn) ?? text(settings.legalNote))
      : text(settings.legalNote),
  phone: text(settings.seller?.phone),
  postalCode: text(settings.seller?.postalCode),
  website: text(settings.seller?.website),
})

export const toBillToSnapshot = (client: ClientSource): BillToSnapshot => ({
  address: text(client.address),
  city: text(client.city),
  country: text(client.country),
  eik: text(client.eik),
  email: text(client.email),
  kind: text(client.kind),
  name: text(client.name),
  postalCode: text(client.postalCode),
  responsiblePerson: text(client.responsiblePerson),
  vatNumber: text(client.vatNumber),
})

/**
 * Read both parties and snapshot them, inside the caller's transaction.
 *
 * `client` arrives as an id in a `beforeChange` hook (Payload has not populated
 * relationships at that point), so it is fetched here. `req` is threaded through
 * both reads so they see the same transaction as the write that triggered them.
 */
export const buildInvoiceSnapshots = async ({
  clientId,
  language,
  req,
}: {
  clientId: number | string
  language: InvoiceLanguage
  req: PayloadRequest
}): Promise<{ billTo: BillToSnapshot; seller: SellerSnapshot }> => {
  const [settings, client] = await Promise.all([
    req.payload.findGlobal({ slug: 'invoice-settings', depth: 0, overrideAccess: true, req }),
    req.payload.findByID({
      collection: 'clients',
      depth: 0,
      id: clientId,
      overrideAccess: true,
      req,
    }),
  ])

  return { billTo: toBillToSnapshot(client), seller: toSellerSnapshot(settings, language) }
}
