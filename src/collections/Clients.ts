import type { CollectionConfig } from 'payload'

import { APIError } from 'payload'

import { admins, editors } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { revalidateCollection, revalidateCollectionDelete } from '@/lib/hooks/revalidate'

/**
 * The people and companies the artist invoices.
 *
 * A separate collection rather than fields on the invoice, because a client is
 * billed more than once and their ЕИК and address should be typed once. Note that
 * this is *not* what an issued invoice prints: the invoice snapshots these values
 * when it is issued and prints the copy from then on — see
 * `@/lib/invoicing/snapshot` for why. Editing a client here therefore corrects
 * the record for future invoices and leaves past ones exactly as they were sent.
 *
 * Read access is `editors`, not `anyone`. Everything in here is personal data
 * under GDPR — names, addresses, tax identifiers — and there is no public
 * frontend that needs it: the client-facing invoice page reads the snapshot on
 * the invoice, through the Local API, not this collection.
 */
export const Clients: CollectionConfig = {
  slug: 'clients',
  access: {
    create: editors,
    delete: admins,
    read: editors,
    update: editors,
  },
  admin: {
    defaultColumns: ['name', 'kind', 'eik', 'city', 'country', 'updatedAt'],
    description:
      'Companies and individuals that get invoiced. A client with invoices cannot be deleted — archive them instead.',
    group: 'Invoicing',
    useAsTitle: 'name',
  },
  defaultSort: 'name',
  fields: [
    {
      name: 'kind',
      type: 'select',
      admin: {
        description:
          'A company invoice needs an ЕИК/БУЛСТАТ and a МОЛ; an individual needs neither.',
      },
      defaultValue: 'company',
      options: [
        { label: 'Юридическо лице (Company)', value: 'company' },
        { label: 'Физическо лице (Individual)', value: 'individual' },
      ],
      required: true,
    },
    {
      name: 'name',
      type: 'text',
      admin: {
        description: 'The full legal name, exactly as it should print on the invoice.',
      },
      index: true,
      label: 'Наименование / Name',
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'eik',
          type: 'text',
          admin: {
            // Hidden rather than merely optional for an individual: a physical
            // person has no ЕИК, and an empty labelled box invites putting an
            // ЕГН there, which has no business being on an invoice.
            condition: (_, siblingData) => siblingData?.kind === 'company',
            description: 'The company identifier from the Commercial Register.',
            width: '50%',
          },
          label: 'ЕИК / БУЛСТАТ',
        },
        {
          name: 'vatNumber',
          type: 'text',
          admin: {
            description: 'Only if the client is VAT-registered. Include the country prefix (BG…).',
            width: '50%',
          },
          label: 'ДДС номер / VAT number',
        },
      ],
    },
    {
      name: 'responsiblePerson',
      type: 'text',
      admin: {
        condition: (_, siblingData) => siblingData?.kind === 'company',
        description: 'Материално отговорно лице — the person who signs for the company.',
      },
      label: 'МОЛ / Responsible person',
    },
    {
      name: 'address',
      type: 'textarea',
      admin: {
        description: 'Street and number. City, postcode and country go in the fields below.',
        rows: 2,
      },
      label: 'Адрес / Address',
      required: true,
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
          admin: {
            description: 'Where the invoice link gets sent.',
            width: '50%',
          },
          label: 'Имейл / Email',
        },
        {
          name: 'phone',
          type: 'text',
          admin: { width: '50%' },
          label: 'Телефон / Phone',
        },
      ],
    },
    {
      name: 'notes',
      type: 'textarea',
      admin: {
        description: 'Internal. Never printed on an invoice.',
        rows: 4,
      },
      label: 'Бележки / Internal notes',
    },
    {
      name: 'archived',
      type: 'checkbox',
      admin: {
        description:
          'Archived clients stay on their old invoices but disappear from the picker when creating a new one.',
        position: 'sidebar',
      },
      defaultValue: false,
      index: true,
    },
    {
      name: 'invoices',
      type: 'join',
      admin: {
        defaultColumns: ['invoiceNumber', 'issueDate', 'total', 'status'],
        description: 'Every invoice issued to this client.',
      },
      collection: 'invoices',
      on: 'client',
    },
  ],
  hooks: {
    afterChange: [revalidateCollection(CACHE_TAGS.invoices)],
    afterDelete: [revalidateCollectionDelete(CACHE_TAGS.invoices)],
    beforeDelete: [
      /**
       * A client with invoices cannot be deleted.
       *
       * `invoices.client` is a required relationship, so removing the row here
       * would leave every one of their invoices pointing at nothing — and an
       * invoice is a document the artist is legally required to keep for years
       * after the client relationship ends. `archived` is the intended escape
       * hatch: it takes them out of the picker without touching the history.
       */
      async ({ id, req }) => {
        const { totalDocs } = await req.payload.count({
          collection: 'invoices',
          overrideAccess: true,
          req,
          where: { client: { equals: id } },
        })

        if (totalDocs > 0) {
          throw new APIError(
            `This client has ${totalDocs} invoice(s) and cannot be deleted — tick "Archived" instead to hide them from the picker.`,
            400,
            undefined,
            true,
          )
        }
      },
    ],
  },
}
