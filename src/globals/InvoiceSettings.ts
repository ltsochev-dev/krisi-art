import type { GlobalConfig } from 'payload'

import { admins, editors } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { revalidateGlobal } from '@/lib/hooks/revalidate'
import { CURRENCIES, DEFAULT_CURRENCY } from '@/lib/invoicing/money'
import { MAX_INVOICE_NUMBER } from '@/lib/invoicing/numbering'
import {
  DEFAULT_INVOICE_LANGUAGE,
  INVOICE_LANGUAGE_OPTIONS,
  PAYMENT_METHODS,
} from '@/lib/invoicing/options'

/**
 * Who the artist is, on paper.
 *
 * All of it lives in the database and none of it in the environment, on purpose.
 * These are values the artist changes herself — a new bank account, a corrected
 * postcode, the next number in the sequence when the accountant asks for one —
 * and putting them in env vars would mean a redeploy for each and would put her
 * BULSTAT and IBAN in the deployment config of a portfolio site. The tax
 * position is the only thing here that is genuinely structural, and it is
 * expressed as editable wording (`legalNote`) rather than as a flag.
 *
 * `read` is `editors` rather than `anyone`. Nothing on the public site needs this
 * global: the client-facing invoice page reaches it through the Local API with
 * `overrideAccess`, and for an issued invoice it does not reach it at all —
 * the seller's details are frozen onto the invoice row itself.
 */
export const InvoiceSettings: GlobalConfig = {
  slug: 'invoice-settings',
  access: {
    read: editors,
    // The numbering sequence and the legal identity are not things to leave open
    // to an editor account; the invoices themselves are.
    update: admins,
  },
  admin: {
    description:
      'The artist’s own details as they print on every invoice, the bank account, and the number sequence.',
    group: 'Invoicing',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          description: 'Printed in the “Издател / Issuer” block of every invoice.',
          fields: [
            {
              name: 'seller',
              type: 'group',
              fields: [
                {
                  name: 'legalName',
                  type: 'text',
                  admin: {
                    description: 'The name registered with the NRA, not the artistic alias.',
                  },
                  label: 'Име / Legal name',
                  required: true,
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'identifier',
                      type: 'text',
                      admin: {
                        description: 'The BULSTAT number issued for the freelance registration.',
                        width: '50%',
                      },
                      label: 'ЕИК / БУЛСТАТ',
                      required: true,
                    },
                    {
                      name: 'activity',
                      type: 'text',
                      admin: {
                        description: 'e.g. “Свободна професия — художник”.',
                        width: '50%',
                      },
                      label: 'Дейност / Activity',
                    },
                  ],
                },
                {
                  name: 'address',
                  type: 'textarea',
                  label: 'Адрес / Address',
                  required: true,
                  admin: { rows: 2 },
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'city',
                      type: 'text',
                      admin: { width: '34%' },
                      label: 'Град / City',
                      required: true,
                    },
                    {
                      name: 'postalCode',
                      type: 'text',
                      admin: { width: '33%' },
                      label: 'Пощенски код / Postcode',
                    },
                    {
                      name: 'country',
                      type: 'text',
                      admin: { width: '33%' },
                      defaultValue: 'България',
                      label: 'Държава / Country',
                      required: true,
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'email',
                      type: 'email',
                      admin: { width: '34%' },
                      label: 'Имейл / Email',
                    },
                    {
                      name: 'phone',
                      type: 'text',
                      admin: { width: '33%' },
                      label: 'Телефон / Phone',
                    },
                    {
                      name: 'website',
                      type: 'text',
                      admin: { width: '33%' },
                      label: 'Уебсайт / Website',
                    },
                  ],
                },
              ],
              label: 'Издател / Issuer',
            },
            /**
             * The legal note in both languages, because it is the one piece of
             * prose on this global that prints on the invoice — everything else
             * here is a name, an address or an account number, which is written
             * the way its own postal or banking system expects. An invoice
             * printed in English needs this sentence readable in English, and
             * there is no per-invoice field to override it with.
             *
             * Whichever one matches the invoice's language is frozen onto it when
             * it is issued; see `@/lib/invoicing/snapshot`.
             */
            {
              name: 'legalNote',
              type: 'textarea',
              admin: {
                description:
                  'Printed under the total on Bulgarian invoices. The default is the statement a person who is not registered under the VAT act is required to put on an invoice. Change it only on your accountant’s advice — if you ever register for VAT, this is where that changes.',
                rows: 2,
              },
              defaultValue: 'Не се начислява ДДС на основание чл. 113, ал. 9 от ЗДДС.',
              label: 'Правна забележка (BG) / Legal note (BG)',
            },
            {
              name: 'legalNoteEn',
              type: 'textarea',
              admin: {
                description:
                  'The same statement for invoices printed in English. Keep the reference to the Bulgarian statute — that is what makes it a legal statement rather than a remark. Left blank, English invoices fall back to the Bulgarian wording above.',
                rows: 2,
              },
              defaultValue:
                'VAT is not charged pursuant to Art. 113(9) of the Bulgarian Value Added Tax Act.',
              label: 'Правна забележка (EN) / Legal note (EN)',
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'logo',
                  type: 'upload',
                  admin: {
                    description: 'Optional. Shown top-left on the invoice.',
                    width: '50%',
                  },
                  relationTo: 'media',
                },
                {
                  name: 'signature',
                  type: 'upload',
                  admin: {
                    description:
                      'Optional scan, shown above the issuer’s name. Unlike the text fields, the logo and signature are read live rather than frozen per invoice — they are branding, not legal identity.',
                    width: '50%',
                  },
                  relationTo: 'media',
                },
              ],
            },
          ],
          label: 'Издател / Issuer',
        },
        {
          description: 'Printed in the payment block. Leave the IBAN blank to omit the block.',
          fields: [
            {
              name: 'bank',
              type: 'group',
              fields: [
                {
                  name: 'name',
                  type: 'text',
                  label: 'Банка / Bank',
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'iban',
                      type: 'text',
                      admin: { width: '60%' },
                      label: 'IBAN',
                    },
                    {
                      name: 'bic',
                      type: 'text',
                      admin: { width: '40%' },
                      label: 'BIC / SWIFT',
                    },
                  ],
                },
              ],
              label: 'Банкова сметка / Bank account',
            },
          ],
          label: 'Банка / Bank',
        },
        {
          fields: [
            {
              name: 'numbering',
              type: 'group',
              fields: [
                {
                  name: 'nextNumber',
                  type: 'number',
                  admin: {
                    description:
                      'The sequence value the next issued invoice will take, padded to ten digits. Set this once, before issuing the first invoice, to continue a sequence started elsewhere — after that it advances on its own. Lowering it cannot create a duplicate: the number actually used is always at least one more than the highest already issued.',
                  },
                  defaultValue: 1,
                  label: 'Следващ номер / Next number',
                  max: MAX_INVOICE_NUMBER,
                  min: 1,
                  required: true,
                },
              ],
              label: 'Номерация / Numbering',
            },
            {
              name: 'defaults',
              type: 'group',
              admin: {
                description: 'Prefilled on every new invoice. Each one stays editable per invoice.',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'currency',
                      type: 'select',
                      admin: { width: '34%' },
                      defaultValue: DEFAULT_CURRENCY,
                      label: 'Валута / Currency',
                      options: CURRENCIES.map((currency) => ({
                        label: currency,
                        value: currency,
                      })),
                    },
                    {
                      name: 'paymentTermsDays',
                      type: 'number',
                      admin: {
                        description: 'Days from the issue date to the due date.',
                        width: '33%',
                      },
                      defaultValue: 14,
                      label: 'Срок за плащане / Payment terms',
                      min: 0,
                    },
                    {
                      name: 'placeOfIssue',
                      type: 'text',
                      admin: { width: '33%' },
                      defaultValue: 'София',
                      label: 'Място на издаване / Place of issue',
                    },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'paymentMethod',
                      type: 'select',
                      admin: { width: '50%' },
                      defaultValue: 'bank',
                      label: 'Начин на плащане / Payment method',
                      options: PAYMENT_METHODS.map(({ label, value }) => ({ label, value })),
                    },
                    {
                      name: 'language',
                      type: 'select',
                      admin: {
                        description:
                          'Which language new invoices are printed in. Set per invoice as well.',
                        width: '50%',
                      },
                      defaultValue: DEFAULT_INVOICE_LANGUAGE,
                      label: 'Език / Language',
                      options: INVOICE_LANGUAGE_OPTIONS,
                    },
                  ],
                },
                {
                  name: 'notes',
                  type: 'textarea',
                  admin: {
                    description: 'Printed at the foot of the invoice, under the legal note.',
                    rows: 3,
                  },
                  label: 'Бележки / Footer notes',
                },
              ],
              label: 'Стойности по подразбиране / Defaults',
            },
          ],
          label: 'Номерация и подразбиране / Numbering & defaults',
        },
      ],
    },
  ],
  hooks: {
    afterChange: [revalidateGlobal(CACHE_TAGS.invoices)],
  },
}
