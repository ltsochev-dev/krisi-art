import type { CollectionConfig } from 'payload'

import { admins, editors } from '@/lib/auth/access'

/** Nothing but the server may write a log row, and nothing may edit one. */
const serverOwned = { create: () => false, update: () => false }

/**
 * Who opened a commission link, and what they took.
 *
 * Rendered on the commission document itself through the `accessLog` join
 * field, so there is no reason to come here except to read a row in isolation.
 *
 * **Retention: raw IP addresses, kept indefinitely.** That is the site owner's
 * deliberate decision, not an oversight and not a default that nobody looked
 * at. An IP address is personal data under the GDPR, so this collection needs a
 * corresponding line in the privacy policy — see the Commissions section of the
 * README. There is no hashing and no prune job on purpose: the log exists so the
 * artist can answer "did they actually get the files, and did anyone else", and
 * a truncated or aged-out log cannot answer it. If that position ever changes,
 * the change belongs here and in the privacy policy together.
 *
 * The parsed `browser` / `os` / `deviceType` columns are stored rather than
 * derived at render time, so the list view is readable without the raw
 * user-agent string in every row — and so a later change to the parsing table
 * in `@/lib/commissions/request` cannot rewrite history.
 */
export const CommissionAccessLog: CollectionConfig = {
  slug: 'commission-access-log',
  access: {
    /**
     * The only writer is the server, through the Local API, which bypasses
     * access control by design — the same arrangement as
     * `contact-submissions`. Nothing public ever writes here directly.
     */
    create: () => false,
    delete: admins,
    read: editors,
    update: () => false,
  },
  admin: {
    defaultColumns: ['commission', 'event', 'ip', 'browser', 'os', 'filename', 'createdAt'],
    description:
      'Append-only record of access to commission links. Contains raw IP addresses, retained indefinitely.',
    group: 'Commissions',
    useAsTitle: 'ip',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'commission',
      type: 'relationship',
      access: serverOwned,
      admin: { readOnly: true },
      index: true,
      relationTo: 'commissions',
      required: true,
    },
    {
      name: 'event',
      type: 'select',
      access: serverOwned,
      admin: { readOnly: true },
      index: true,
      options: [
        { label: 'Viewed the page', value: 'view' },
        { label: 'Downloaded a file', value: 'download' },
        { label: 'Entered the password', value: 'unlock-success' },
        { label: 'Wrong password', value: 'unlock-failed' },
        { label: 'Refused', value: 'denied' },
      ],
      required: true,
    },
    {
      name: 'filename',
      type: 'text',
      access: serverOwned,
      admin: {
        condition: (_, siblingData) => siblingData?.event === 'download',
        description: 'Set on download events only.',
        readOnly: true,
      },
    },
    {
      name: 'fileId',
      type: 'text',
      access: serverOwned,
      admin: {
        condition: (_, siblingData) => siblingData?.event === 'download',
        readOnly: true,
      },
    },
    {
      name: 'reason',
      type: 'text',
      access: serverOwned,
      admin: {
        condition: (_, siblingData) => siblingData?.event === 'denied',
        description: 'Why the request was refused: disabled, expired, no-password, rate-limited.',
        readOnly: true,
      },
    },
    {
      name: 'ip',
      type: 'text',
      access: serverOwned,
      admin: {
        description:
          'As reported by the reverse proxy. Trivially spoofable by a direct caller — forensic colour, not access control.',
        readOnly: true,
      },
      index: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'browser',
          type: 'text',
          access: serverOwned,
          admin: { readOnly: true, width: '33%' },
        },
        { name: 'os', type: 'text', access: serverOwned, admin: { readOnly: true, width: '33%' } },
        {
          name: 'deviceType',
          type: 'text',
          access: serverOwned,
          admin: { readOnly: true, width: '34%' },
        },
      ],
    },
    {
      name: 'userAgent',
      type: 'textarea',
      access: serverOwned,
      admin: { readOnly: true, rows: 3 },
    },
    {
      name: 'referer',
      type: 'text',
      access: serverOwned,
      admin: {
        description: 'Where the link was clicked from, when the browser says.',
        readOnly: true,
      },
    },
  ],
}
