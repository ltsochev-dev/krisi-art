import type { CollectionConfig, Where } from 'payload'

import { admins, editors } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { revalidateCollection, revalidateCollectionDelete } from '@/lib/hooks/revalidate'
import { applyInvoiceRules, guardInvoiceDelete, prepareInvoice } from '@/lib/invoicing/hooks'
import { CURRENCIES, DEFAULT_CURRENCY } from '@/lib/invoicing/money'
import {
  DEFAULT_INVOICE_LANGUAGE,
  INVOICE_LANGUAGE_OPTIONS,
  LINE_UNITS,
  PAYMENT_METHODS,
} from '@/lib/invoicing/options'
import {
  editableWhileDraft,
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  isIssued,
} from '@/lib/invoicing/status'
import { BASE_CURRENCY } from '@/lib/invoicing/totals'
import { getSiteUrl } from '@/lib/seo/metadata'

/**
 * Invoices.
 *
 * The rules that matter — numbering, the issue-time freeze, the derived amounts,
 * the client and seller snapshots — all live in `@/lib/invoicing`. What is left
 * here is the shape of the document and the shape of the screen, and two
 * decisions worth pointing at:
 *
 * **`versions` is the history tab.** Payload writes a version on every save and
 * renders them as a Versions tab on the document, with a field-by-field diff
 * between any two and a restore button. That is a better audit trail than an
 * append-only log field would be, and it costs one line of config. `maxPerDoc: 0`
 * keeps all of them: the whole point is that the record of who changed what is
 * complete, so a retention cap would be the one thing that could undermine it.
 *
 * **Locked fields are locked twice.** `editableWhileDraft` on a field is what
 * makes the admin panel render it read-only once the invoice is issued;
 * `applyInvoiceRules` is what makes that true no matter who is writing. See the
 * note at the top of `@/lib/invoicing/hooks` for why both are needed.
 *
 * Labels are bilingual throughout, because the artist works in Bulgarian and the
 * clients do not all read it — the same reason the client-facing page at
 * `/invoice/<uuid>` prints both.
 */
export const Invoices: CollectionConfig = {
  slug: 'invoices',
  access: {
    create: editors,
    delete: admins,
    read: editors,
    readVersions: editors,
    update: editors,
  },
  admin: {
    defaultColumns: [
      'invoiceNumber',
      'client',
      'issueDate',
      'total',
      'currency',
      'language',
      'status',
    ],
    description:
      'Drafts are freely editable and have no number. Issuing one assigns the next number in the sequence, freezes everything that prints on it, and records every later change in the Versions tab.',
    group: 'Invoicing',
    useAsTitle: 'invoiceNumber',
  },
  defaultSort: '-issueDate',
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          fields: [
            {
              name: 'client',
              type: 'relationship',
              access: { update: editableWhileDraft },
              admin: {
                description: 'Their details are copied onto this invoice when it is issued.',
              },
              /**
               * Archived clients are out of the picker but never out of an
               * invoice that already names them. Without the second clause,
               * archiving a client would make their issued invoices fail
               * validation on the next save — which is every time one of them is
               * marked paid.
               */
              filterOptions: ({ data }) => {
                const selected =
                  data?.client && typeof data.client === 'object' ? data.client.id : data?.client

                const or: Where[] = [{ archived: { not_equals: true } }]

                if (selected) {
                  or.push({ id: { equals: selected } })
                }

                return { or }
              },
              index: true,
              label: 'Получател / Client',
              relationTo: 'clients',
              required: true,
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'issueDate',
                  type: 'date',
                  access: { update: editableWhileDraft },
                  admin: {
                    date: { displayFormat: 'dd.MM.yyyy', pickerAppearance: 'dayOnly' },
                    width: '50%',
                  },
                  defaultValue: () => new Date().toISOString(),
                  index: true,
                  label: 'Дата на издаване / Issue date',
                  required: true,
                },
                {
                  name: 'dueDate',
                  type: 'date',
                  access: { update: editableWhileDraft },
                  admin: {
                    date: { displayFormat: 'dd.MM.yyyy', pickerAppearance: 'dayOnly' },
                    description: 'Leave blank to use the payment terms from Invoicing → Settings.',
                    width: '50%',
                  },
                  label: 'Срок за плащане / Due date',
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'placeOfIssue',
                  type: 'text',
                  access: { update: editableWhileDraft },
                  admin: { width: '50%' },
                  defaultValue: async ({ req }) =>
                    (
                      await req.payload.findGlobal({
                        slug: 'invoice-settings',
                        depth: 0,
                        overrideAccess: true,
                        req,
                      })
                    ).defaults?.placeOfIssue ?? undefined,
                  label: 'Място на издаване / Place of issue',
                },
                {
                  name: 'paymentMethod',
                  type: 'select',
                  access: { update: editableWhileDraft },
                  admin: { width: '50%' },
                  defaultValue: async ({ req }) =>
                    (
                      await req.payload.findGlobal({
                        slug: 'invoice-settings',
                        depth: 0,
                        overrideAccess: true,
                        req,
                      })
                    ).defaults?.paymentMethod ?? 'bank',
                  label: 'Начин на плащане / Payment method',
                  options: PAYMENT_METHODS.map(({ label, value }) => ({ label, value })),
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'currency',
                  type: 'select',
                  access: { update: editableWhileDraft },
                  admin: { width: '50%' },
                  defaultValue: async ({ req }) =>
                    (
                      await req.payload.findGlobal({
                        slug: 'invoice-settings',
                        depth: 0,
                        overrideAccess: true,
                        req,
                      })
                    ).defaults?.currency ?? DEFAULT_CURRENCY,
                  label: 'Валута / Currency',
                  options: CURRENCIES.map((currency) => ({ label: currency, value: currency })),
                  required: true,
                },
                {
                  name: 'language',
                  type: 'select',
                  access: { update: editableWhileDraft },
                  admin: {
                    description:
                      'The whole client-facing invoice — labels, dates, number formats and the amount in words — is printed in this one language. Defaults to the language set under Invoicing → Settings.',
                    width: '50%',
                  },
                  defaultValue: async ({ req }) =>
                    (
                      await req.payload.findGlobal({
                        slug: 'invoice-settings',
                        depth: 0,
                        overrideAccess: true,
                        req,
                      })
                    ).defaults?.language ?? DEFAULT_INVOICE_LANGUAGE,
                  label: 'Език / Language',
                  options: INVOICE_LANGUAGE_OPTIONS,
                  required: true,
                },
              ],
            },
            {
              name: 'exchangeRate',
              type: 'number',
              access: { update: editableWhileDraft },
              admin: {
                // Only asked for when it is needed, and it is only needed for an
                // invoice billed outside the currency the books are kept in. See
                // `baseTotal` below.
                condition: (data) => Boolean(data?.currency) && data.currency !== BASE_CURRENCY,
                description: `How many units of the invoice currency make one ${BASE_CURRENCY}, per the BNB rate on the issue date.`,
                step: 0.00001,
                width: '50%',
              },
              label: `Курс към ${BASE_CURRENCY} / Rate to ${BASE_CURRENCY}`,
              min: 0,
            },
          ],
          label: 'Фактура / Invoice',
        },
        {
          fields: [
            {
              name: 'items',
              type: 'array',
              access: { update: editableWhileDraft },
              admin: {
                description: 'What is being billed. Each row prints as one line on the invoice.',
                initCollapsed: false,
              },
              fields: [
                {
                  name: 'description',
                  type: 'textarea',
                  admin: {
                    description: 'What was delivered, in the client’s language.',
                    rows: 2,
                  },
                  label: 'Описание / Description',
                  required: true,
                },
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'quantity',
                      type: 'number',
                      admin: {
                        description: 'Fractions are fine — 2.5 hours, half a day.',
                        step: 0.5,
                        width: '25%',
                      },
                      defaultValue: 1,
                      label: 'Количество / Qty',
                      min: 0,
                      required: true,
                    },
                    {
                      name: 'unit',
                      type: 'select',
                      admin: { width: '25%' },
                      defaultValue: 'piece',
                      label: 'Мярка / Unit',
                      options: LINE_UNITS.map(({ label, value }) => ({ label, value })),
                    },
                    {
                      name: 'unitPrice',
                      type: 'number',
                      admin: { step: 0.01, width: '25%' },
                      label: 'Ед. цена / Unit price',
                      min: 0,
                      required: true,
                    },
                    {
                      name: 'total',
                      type: 'number',
                      admin: {
                        description: 'Calculated.',
                        readOnly: true,
                        width: '25%',
                      },
                      label: 'Сума / Amount',
                    },
                  ],
                },
              ],
              // Deliberately not `required`/`minRows: 1`: a draft is a working
              // document and is often saved before the lines are known. The
              // "needs at least one line" rule belongs to *issuing*, and lives in
              // `applyInvoiceRules` where it can say so.
              labels: { plural: 'Позиции / Line items', singular: 'Позиция / Line item' },
            },
            {
              name: 'discountPercent',
              type: 'number',
              access: { update: editableWhileDraft },
              admin: {
                description:
                  'Optional. Taken off the subtotal as its own line, not spread across the prices.',
                step: 0.5,
              },
              label: 'Отбив / Discount (%)',
              max: 100,
              min: 0,
            },
            /**
             * Everything below is computed by `applyInvoiceRules` on every save
             * while the invoice is a draft, and pinned once it is issued. They are
             * stored rather than derived at render time so that an issued invoice
             * prints the same numbers forever, even if the rounding rules in
             * `@/lib/invoicing/totals` are ever revisited.
             */
            {
              type: 'row',
              fields: [
                {
                  name: 'subtotal',
                  type: 'number',
                  access: { update: editableWhileDraft },
                  admin: { readOnly: true, width: '34%' },
                  label: 'Междинна сума / Subtotal',
                },
                {
                  name: 'discountAmount',
                  type: 'number',
                  access: { update: editableWhileDraft },
                  admin: {
                    condition: (data) => Boolean(data?.discountPercent),
                    readOnly: true,
                    width: '33%',
                  },
                  label: 'Отбив / Discount',
                },
                {
                  name: 'total',
                  type: 'number',
                  access: { update: editableWhileDraft },
                  admin: { readOnly: true, width: '33%' },
                  label: 'Общо / Total',
                },
              ],
            },
            {
              name: 'totalInWords',
              type: 'text',
              access: { update: editableWhileDraft },
              admin: {
                description:
                  'The “(словом)” line, generated from the total. Blank for currencies with no Bulgarian convention.',
                readOnly: true,
              },
              label: 'Словом / Total in words',
            },
            {
              name: 'baseTotal',
              type: 'number',
              access: { update: editableWhileDraft },
              admin: {
                condition: (data) => Boolean(data?.currency) && data.currency !== BASE_CURRENCY,
                description: `The total converted at the rate above. Bulgaria keeps its books in ${BASE_CURRENCY}.`,
                readOnly: true,
              },
              label: `Равностойност в ${BASE_CURRENCY} / ${BASE_CURRENCY} equivalent`,
            },
          ],
          label: 'Позиции / Line items',
        },
        {
          fields: [
            {
              name: 'notes',
              type: 'textarea',
              access: { update: editableWhileDraft },
              admin: {
                description:
                  'Printed on the invoice, under the totals. Frozen when the invoice is issued, like everything else the client sees.',
                rows: 4,
              },
              defaultValue: async ({ req }) =>
                (
                  await req.payload.findGlobal({
                    slug: 'invoice-settings',
                    depth: 0,
                    overrideAccess: true,
                    req,
                  })
                ).defaults?.notes ?? undefined,
              label: 'Бележки / Notes to the client',
            },
            {
              name: 'internalNotes',
              type: 'textarea',
              admin: {
                description:
                  'Never printed, never frozen — editable for as long as the invoice exists.',
                rows: 4,
              },
              label: 'Вътрешни бележки / Internal notes',
            },
          ],
          label: 'Бележки / Notes',
        },
        {
          admin: {
            // Nothing to show until the invoice is issued: while it is a draft the
            // printed page reads the live client and settings records instead.
            condition: (data) => isIssued(data?.status),
          },
          description:
            'Copied from the client record and Invoicing → Settings at the moment this invoice was issued, and printed on it from then on. Later edits to those records do not reach back into this document.',
          fields: [
            {
              name: 'seller',
              type: 'group',
              admin: { readOnly: true },
              fields: [
                { name: 'legalName', type: 'text', label: 'Име / Legal name' },
                { name: 'identifier', type: 'text', label: 'ЕИК / БУЛСТАТ' },
                { name: 'activity', type: 'text', label: 'Дейност / Activity' },
                { name: 'address', type: 'textarea', label: 'Адрес / Address' },
                { name: 'city', type: 'text', label: 'Град / City' },
                { name: 'postalCode', type: 'text', label: 'Пощенски код / Postcode' },
                { name: 'country', type: 'text', label: 'Държава / Country' },
                { name: 'email', type: 'text', label: 'Имейл / Email' },
                { name: 'phone', type: 'text', label: 'Телефон / Phone' },
                { name: 'website', type: 'text', label: 'Уебсайт / Website' },
                { name: 'bankName', type: 'text', label: 'Банка / Bank' },
                { name: 'iban', type: 'text', label: 'IBAN' },
                { name: 'bic', type: 'text', label: 'BIC / SWIFT' },
                { name: 'legalNote', type: 'textarea', label: 'Правна забележка / Legal note' },
              ],
              label: 'Издател / Issuer',
            },
            {
              name: 'billTo',
              type: 'group',
              admin: { readOnly: true },
              fields: [
                { name: 'name', type: 'text', label: 'Наименование / Name' },
                { name: 'kind', type: 'text', label: 'Тип / Kind' },
                { name: 'eik', type: 'text', label: 'ЕИК / БУЛСТАТ' },
                { name: 'vatNumber', type: 'text', label: 'ДДС номер / VAT number' },
                { name: 'responsiblePerson', type: 'text', label: 'МОЛ / Responsible person' },
                { name: 'address', type: 'textarea', label: 'Адрес / Address' },
                { name: 'city', type: 'text', label: 'Град / City' },
                { name: 'postalCode', type: 'text', label: 'Пощенски код / Postcode' },
                { name: 'country', type: 'text', label: 'Държава / Country' },
                { name: 'email', type: 'text', label: 'Имейл / Email' },
              ],
              label: 'Получател / Client',
            },
          ],
          label: 'Данни при издаване / Issued details',
        },
      ],
    },
    {
      name: 'status',
      type: 'select',
      admin: {
        description:
          'Moving off “Чернова” issues the invoice: it takes the next number and stops being editable. There is no way back.',
        position: 'sidebar',
      },
      defaultValue: 'draft',
      index: true,
      label: 'Статус / Status',
      options: INVOICE_STATUSES.map((status) => ({
        label: INVOICE_STATUS_LABELS[status],
        value: status,
      })),
      required: true,
    },
    {
      name: 'invoiceNumber',
      type: 'text',
      admin: {
        description: 'Assigned from the sequence when the invoice is issued.',
        position: 'sidebar',
        readOnly: true,
      },
      index: true,
      label: 'Номер / Invoice number',
      // The last defence against a duplicate number, behind the reconciliation in
      // `@/lib/invoicing/numbering`.
      unique: true,
    },
    {
      name: 'paidDate',
      type: 'date',
      admin: {
        condition: (data) => data?.status === 'paid',
        date: { displayFormat: 'dd.MM.yyyy', pickerAppearance: 'dayOnly' },
        description: 'Defaults to today when the status is set to paid.',
        position: 'sidebar',
      },
      label: 'Дата на плащане / Paid on',
    },
    {
      name: 'uuid',
      type: 'text',
      admin: {
        description: 'The client-facing address of this invoice. Generated once, never changes.',
        position: 'sidebar',
        readOnly: true,
      },
      index: true,
      label: 'UUID',
      unique: true,
    },
    {
      name: 'publicUrl',
      type: 'text',
      admin: {
        description: 'Send this to the client. It works for anyone holding the link.',
        position: 'sidebar',
        readOnly: true,
      },
      hooks: {
        // Virtual, so nothing is stored and the origin is never baked into a row —
        // the same document renders the right link in development and production.
        afterRead: [
          ({ data }) => (data?.uuid ? `${getSiteUrl()?.origin ?? ''}/invoice/${data.uuid}` : null),
        ],
      },
      label: 'Връзка / Public link',
      virtual: true,
    },
  ],
  hooks: {
    afterChange: [revalidateCollection(CACHE_TAGS.invoices)],
    afterDelete: [revalidateCollectionDelete(CACHE_TAGS.invoices)],
    beforeChange: [applyInvoiceRules],
    beforeDelete: [guardInvoiceDelete],
    beforeValidate: [prepareInvoice],
  },
  /**
   * The history tab. Every save — by the artist, by the API, by a status change —
   * is a version, diffable against any other and restorable. Unlimited, because a
   * partial audit trail on a legal document is worse than none.
   */
  versions: {
    maxPerDoc: 0,
  },
}
