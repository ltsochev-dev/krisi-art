/**
 * The invoice as the client sees it.
 *
 * Addressed by the invoice's UUID and by nothing else: possession of the link is
 * the authorisation, which is why the read helper is the only place in the app
 * that reaches into the `editors`-only `invoices` collection on an anonymous
 * request. See the note at the top of `@/lib/content/invoices`.
 *
 * Server-rendered end to end. The only client component on the page is the print
 * button, because `window.print()` needs a browser — everything else is a static
 * document, and the print stylesheet is what turns it into A4.
 *
 * **One language per invoice.** Every label, date, number and the amount in words
 * comes out in `invoice.language`, chosen per document in the admin panel. A
 * bilingual layout was the obvious first answer to a client list split between
 * Bulgaria and abroad, but it doubles the label count on a dense document to serve
 * a reader who only ever needed one half of it — and the reader is known at the
 * point the invoice is written. `t()` below is the whole mechanism.
 *
 * Layout notes:
 *
 * - There is no VAT block. The artist is not registered under the VAT act, so the
 *   total is the sum of the lines and the чл. 113, ал. 9 note under it explains
 *   why — that note is frozen onto the invoice at issue, not read live.
 * - A draft and a cancelled invoice both render, each behind a banner saying so.
 *   Refusing to render a draft would make the UUID useless as a preview, and
 *   refusing to render a cancelled one would hide the evidence that its number was
 *   consumed.
 */
import type { Metadata } from 'next'

import React from 'react'

import { notFound } from 'next/navigation'

import type { InvoiceImage, PublicInvoice } from '@/lib/content/invoices'
import type { InvoiceLabelKey } from '@/lib/invoicing/labels'
import type { InvoiceLanguage } from '@/lib/invoicing/options'

import PrintButton from '@/components/invoice/PrintButton'
import { getInvoiceByUuid } from '@/lib/content/queries'
import {
  formatInvoiceDate,
  formatQuantity,
  formatRate,
  INVOICE_LABELS,
  INVOICE_PROSE,
  LOCALES,
} from '@/lib/invoicing/labels'
import { formatMoney } from '@/lib/invoicing/money'

type Props = { params: Promise<{ uuid: string }> }

/** A definition row that renders nothing at all when there is no value. */
const Row = ({ label, value }: { label: string; value: null | string }) =>
  value ? (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  ) : null

/**
 * Named `PrintImage` rather than `Image` so `jsx-a11y/alt-text` does not mistake
 * it for an image component whose call sites need an `alt` prop — the alt text
 * comes off the media document below, and there is nothing for a call site to
 * pass.
 *
 * Alt is optional on `Media`, and an upload without one falls back to `''`
 * rather than to a made-up label: both images here — the logo and the signature
 * — sit beside the seller's legal name in the markup, so an empty alt correctly
 * marks them decorative instead of making a screen reader read the name twice.
 */
const PrintImage = ({ className, image }: { className: string; image: InvoiceImage | null }) =>
  image ? (
    // Plain `<img>`, not `next/image`: this page is printed, and the optimiser's
    // srcset would have the browser pick a screen-sized candidate for paper.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={image.alt ?? ''}
      className={className}
      height={image.height ?? undefined}
      src={image.url}
      width={image.width ?? undefined}
    />
  ) : null

/**
 * Only the title, so the `robots` directives set on the layout survive — Next
 * merges metadata field by field at the top level, and this route must stay
 * unindexed.
 */
export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { uuid } = await params
  const invoice = await getInvoiceByUuid(uuid)

  if (!invoice) {
    return {}
  }

  const title = INVOICE_LABELS.title[invoice.language]

  return {
    title: invoice.invoiceNumber
      ? `${title} ${INVOICE_LABELS.number[invoice.language]} ${invoice.invoiceNumber}`
      : `${title} (${INVOICE_LABELS.draft[invoice.language]})`,
  }
}

export default async function InvoicePage({ params }: Props) {
  const { uuid } = await params
  const invoice = await getInvoiceByUuid(uuid)

  if (!invoice) {
    notFound()
  }

  const { billTo, currency, language, seller } = invoice

  /** Every label on the page goes through here. */
  const t = (key: InvoiceLabelKey): string => INVOICE_LABELS[key][language]
  const money = (amount: number) => formatMoney(amount, currency, LOCALES[language])
  const date = (value: null | string) => formatInvoiceDate(value, language)

  return (
    <>
      <article className={`sheet${invoice.isCancelled ? 'sheet--void' : ''}`}>
        <header className="head">
          <PrintImage className="head__logo" image={invoice.logo} />

          <div className="head__meta">
            <h1 className="head__title">{t('title')}</h1>

            <p className="head__number">
              {t('number')} {invoice.invoiceNumber ?? '—'}
            </p>

            <dl className="head__dates">
              <div>
                <dt>{t('issueDate')}</dt>
                <dd>{date(invoice.issueDate) ?? '—'}</dd>
              </div>
              {invoice.dueDate ? (
                <div>
                  <dt>{t('dueDate')}</dt>
                  <dd>{date(invoice.dueDate)}</dd>
                </div>
              ) : null}
              {invoice.placeOfIssue ? (
                <div>
                  <dt>{t('placeOfIssue')}</dt>
                  <dd>{invoice.placeOfIssue}</dd>
                </div>
              ) : null}
              {invoice.paidDate ? (
                <div>
                  <dt>{t('paidOn')}</dt>
                  <dd>{date(invoice.paidDate)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </header>

        <StatusBanner invoice={invoice} />

        <section className="parties">
          <div className="party">
            <h2 className="party__heading">{t('issuer')}</h2>
            <p className="party__name">{seller.legalName ?? '—'}</p>
            {seller.activity ? <p className="party__address">{seller.activity}</p> : null}
            <Address
              address={seller.address}
              city={seller.city}
              country={seller.country}
              postalCode={seller.postalCode}
            />
            <dl className="party__rows">
              <Row label={t('eik')} value={seller.identifier} />
              <Row label={t('email')} value={seller.email} />
              <Row label={t('phone')} value={seller.phone} />
            </dl>
          </div>

          <div className="party">
            <h2 className="party__heading">{t('recipient')}</h2>
            <p className="party__name">{billTo.name ?? '—'}</p>
            <Address
              address={billTo.address}
              city={billTo.city}
              country={billTo.country}
              postalCode={billTo.postalCode}
            />
            <dl className="party__rows">
              <Row label={t('eik')} value={billTo.eik} />
              <Row label={t('vatNumber')} value={billTo.vatNumber} />
              <Row label={t('responsiblePerson')} value={billTo.responsiblePerson} />
              <Row label={t('email')} value={billTo.email} />
            </dl>
          </div>
        </section>

        <div className="lines-wrap">
          <table className="lines">
            <thead>
              <tr>
                <th className="idx">{t('number')}</th>
                <th>{t('description')}</th>
                <th>{t('unit')}</th>
                <th className="num">{t('quantity')}</th>
                <th className="num">{t('unitPrice')}</th>
                <th className="num">{t('amount')}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, index) => (
                <tr key={index}>
                  <td className="idx">{index + 1}</td>
                  <td className="desc">{line.description}</td>
                  <td>{line.unit ?? ''}</td>
                  <td className="num">{formatQuantity(line.quantity, language)}</td>
                  <td className="num">{money(line.unitPrice)}</td>
                  <td className="num">{money(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="summary">
          <table className="summary__table">
            <tbody>
              <tr>
                <td>{t('subtotal')}</td>
                <td className="num">{money(invoice.subtotal)}</td>
              </tr>
              {invoice.discountAmount > 0 ? (
                <tr>
                  <td>
                    {t('discount')}
                    {invoice.discountPercent
                      ? ` (${formatQuantity(invoice.discountPercent, language)}%)`
                      : ''}
                  </td>
                  <td className="num">−{money(invoice.discountAmount)}</td>
                </tr>
              ) : null}
              <tr className="summary__total">
                <td>{t('total')}</td>
                <td className="num">{money(invoice.total)}</td>
              </tr>
              {/* Only for an invoice billed outside the currency the books are
                  kept in; the rate it was converted at is stated with it. */}
              {invoice.baseTotal !== null ? (
                <tr className="summary__base">
                  <td>
                    {t('baseEquivalent')}
                    {invoice.exchangeRate
                      ? ` (${t('rate')} ${formatRate(invoice.exchangeRate, language)})`
                      : ''}
                  </td>
                  <td className="num">
                    {formatMoney(invoice.baseTotal, 'EUR', LOCALES[language])}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {invoice.totalInWords ? (
          <dl className="words">
            <dt>{t('totalInWords')}</dt>
            <dd>{invoice.totalInWords}</dd>
          </dl>
        ) : null}

        <div className="blocks">
          {seller.iban || invoice.paymentMethod ? (
            <section>
              {/* `payment`, not `paymentMethod` — the method is one of the rows
                  inside this block, and repeating the words as its heading read
                  as a mistake. */}
              <h2 className="block__heading">{t('payment')}</h2>
              <dl className="block__rows">
                <Row label={t('paymentMethod')} value={invoice.paymentMethod} />
                <Row label={t('bank')} value={seller.bankName} />
                <Row label={t('iban')} value={seller.iban} />
                <Row label={t('bic')} value={seller.bic} />
                <Row label={t('dueDate')} value={date(invoice.dueDate)} />
              </dl>
            </section>
          ) : null}
        </div>

        {seller.legalNote || invoice.notes ? (
          <section className="legal">
            {invoice.notes ? <p>{invoice.notes}</p> : null}
            {seller.legalNote ? <p>{seller.legalNote}</p> : null}
          </section>
        ) : null}

        <section className="sign">
          <div className="sign__box">
            <PrintImage className="sign__image" image={invoice.signature} />
            <div className="sign__rule">
              <span className="caption">{t('signature')}</span>
              <div className="sign__name">{seller.legalName}</div>
            </div>
          </div>
        </section>
      </article>

      <div className="toolbar no-print">
        <PrintButton label={t('print')} />
      </div>
    </>
  )
}

/**
 * Splits the address across the lines a postal address is read on, and drops the
 * whole block when there is nothing to put in it.
 */
const Address = ({
  address,
  city,
  country,
  postalCode,
}: {
  address: null | string
  city: null | string
  country: null | string
  postalCode: null | string
}) => {
  const locality = [postalCode, city].filter(Boolean).join(' ')
  const lines = [address, locality, country].filter(Boolean)

  return lines.length > 0 ? <p className="party__address">{lines.join('\n')}</p> : null
}

/**
 * The one thing on the page that is about the invoice's state rather than its
 * content. An issued invoice gets no banner — the absence is the statement.
 */
const StatusBanner = ({ invoice }: { invoice: PublicInvoice }) => {
  const banner = (key: 'cancelled' | 'draft', language: InvoiceLanguage) => (
    <p className="banner">
      {INVOICE_LABELS[key][language]}
      <small>{INVOICE_PROSE[key === 'draft' ? 'draftNote' : 'cancelledNote'][language]}</small>
    </p>
  )

  if (invoice.isCancelled) {
    return banner('cancelled', invoice.language)
  }

  if (invoice.isDraft) {
    return banner('draft', invoice.language)
  }

  return null
}
