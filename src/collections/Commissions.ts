import type { CollectionConfig } from 'payload'

import { admins, editors } from '@/lib/auth/access'
import { commissionEndpoints } from '@/lib/commissions/endpoints'
import {
  commissionPath,
  isValidCommissionSlug,
  MAX_COMMISSION_SLUG_LENGTH,
  normaliseCommissionSlug,
} from '@/lib/commissions/routes'
import {
  deleteCommissionAccessLog,
  deleteCommissionObjects,
  prepareCommission,
} from '@/lib/commissions/hooks'
import { getSiteUrl } from '@/lib/seo/metadata'

/**
 * Commissions — private file delivery, and private photo albums.
 *
 * A commission is a set of files plus one shareable link. The files live in a
 * dedicated bucket with public access blocked and no CDN in front of it, so a
 * presigned URL is the only way to read a byte of one. See
 * `@/lib/commissions/keys` for why that is a property of the infrastructure
 * rather than of a code path.
 *
 * Two fields decide how a commission presents itself, and neither touches
 * access control:
 *
 * - **`layout`** — a download list (a client collecting finished work) or a
 *   photo grid (an album shared with friends). Same document, same bucket, same
 *   gate; only the page differs.
 * - **`slug`** — an optional vanity address, `/album/<slug>`, in place of
 *   `/commission/<uuid>`. Easier to share and correspondingly easier to guess;
 *   `@/lib/commissions/routes` is where that trade is written down.
 *
 * Nothing on this collection is reachable from the sitemap, the gallery index
 * or any link on the site, whichever of the two it is. `robots.ts` disallows
 * both routes and the layout sends `noindex`.
 *
 * Three things about this file worth knowing before changing it.
 *
 * **The `files` array is server-owned.** Every mutation goes through the custom
 * endpoints in `@/lib/commissions/endpoints`, which is what keeps the rows and
 * the S3 objects in step. A row removed by hand in the admin panel would leave
 * its object behind, paid for and unreachable; a row added by hand would point
 * at nothing. `label` is the one row field the artist may change after the
 * fact, and even that goes through an endpoint — see the comment on it.
 *
 * **The collection is registered unconditionally**, even with no
 * `S3_COMMISSIONS_BUCKET` set. The database schema must not depend on the
 * environment, or a checkout with no AWS config would generate a different
 * migration than the one production runs. Missing configuration is handled at
 * the endpoints and in the uploader instead, each of which says so plainly.
 *
 * **No `versions`.** The invoice case for them — a legal document with an audit
 * requirement — does not apply here, and every view would write a version,
 * since a view increments a counter on the document.
 */
export const Commissions: CollectionConfig = {
  slug: 'commissions',
  access: {
    create: editors,
    delete: admins,
    read: editors,
    update: editors,
  },
  admin: {
    defaultColumns: ['title', 'layout', 'slug', 'enabled', 'viewCount', 'lastAccessedAt'],
    description:
      'Private file delivery and private photo albums. Upload the files, pick a presentation, tick Enabled, then send the link from the sidebar. Every view and download is recorded on the document.',
    group: 'Commissions',
    useAsTitle: 'title',
  },
  defaultSort: '-createdAt',
  endpoints: commissionEndpoints,
  fields: [
    {
      name: 'title',
      type: 'text',
      admin: {
        description: 'Shown to the client at the top of the page. Name it after the work.',
      },
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Optional. Rendered above the file list, for delivery notes or instructions.',
        rows: 4,
      },
    },
    {
      /**
       * The uploader, which is where the files actually come from. A `ui` field
       * so it has no column and no value — it talks to the endpoints directly
       * and re-reads the array below.
       */
      name: 'uploader',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/admin/CommissionUploader#CommissionUploader',
        },
      },
      label: 'Files',
    },
    {
      name: 'files',
      type: 'array',
      /**
       * Nothing in the admin panel or over REST may write this array; see the
       * note at the top of the file. Even `label`, the one row field with no S3
       * object behind it, is edited through an endpoint rather than here — the
       * comment on that field explains why a subfield carve-out cannot work.
       */
      access: { create: () => false, update: () => false },
      admin: {
        description:
          'Managed by the uploader above. Read-only here so a row can never lose track of its file in the bucket.',
        initCollapsed: true,
        readOnly: true,
      },
      fields: [
        { name: 'fileId', type: 'text', admin: { readOnly: true }, required: true },
        {
          name: 'key',
          type: 'text',
          admin: {
            description: 'The object key in the private bucket.',
            readOnly: true,
          },
          required: true,
        },
        { name: 'filename', type: 'text', admin: { readOnly: true }, required: true },
        {
          name: 'label',
          type: 'text',
          /**
           * A friendlier name for the client than `IMG_4821_final_v3.tif`, and
           * the one field on a row with no S3 object behind it — so it is the
           * one thing about a delivered file that may change after the fact.
           *
           * It is nonetheless read-only *here*, and a per-subfield `access`
           * carve-out would not help. When the parent array's `update` access
           * denies a write, Payload deletes the incoming value and refills it
           * from the stored document before it ever descends into the row
           * subfields, so a `PATCH` carrying `files` returns 200 with the whole
           * array quietly reverted. Editing a label therefore goes through
           * `PATCH /api/commissions/:id/files/:fileId` — see
           * `@/lib/commissions/endpoints/update-label` — which the uploader
           * above calls. That keeps the rule intact: every mutation of this
           * array goes through an endpoint.
           */
          admin: {
            description: 'Optional. Shown to the client instead of the filename.',
            readOnly: true,
          },
        },
        { name: 'filesize', type: 'number', admin: { readOnly: true } },
        { name: 'mimeType', type: 'text', admin: { readOnly: true } },
        { name: 'uploadedAt', type: 'date', admin: { readOnly: true } },
        { name: 'downloadCount', type: 'number', admin: { readOnly: true }, defaultValue: 0 },
      ],
      labels: { plural: 'Delivered files', singular: 'Delivered file' },
    },
    {
      name: 'internalNotes',
      type: 'textarea',
      admin: {
        description: 'Never shown to the client, and never sent to the browser on the public page.',
        rows: 4,
      },
    },
    {
      /**
       * A join, so the log renders as a paginated list on the document with no
       * custom UI at all. Note that a join field takes no `create`/`update`
       * access — there is nothing to write through it — and that the log
       * collection itself refuses writes from everyone but the server.
       */
      name: 'accessLog',
      type: 'join',
      admin: {
        allowCreate: false,
        defaultColumns: ['event', 'ip', 'browser', 'os', 'filename', 'createdAt'],
        description: 'Every view, download and unlock attempt on the public link.',
      },
      collection: 'commission-access-log',
      defaultLimit: 25,
      defaultSort: '-createdAt',
      label: 'Access log',
      on: 'commission',
    },
    {
      /**
       * What the public page looks like. Nothing about *access* varies with it
       * — same bucket, same link, same optional password — so it is a
       * presentation switch and nothing more.
       *
       * `files` stays the default because that is what a commission is for. The
       * gallery is the same machinery pointed at a different job: a set of
       * photographs shared with people who want to look at them rather than
       * collect them.
       */
      name: 'layout',
      type: 'select',
      admin: {
        description:
          'How the page draws itself. A photo gallery shows the images as a grid with a full-screen viewer; anything a browser cannot display is listed underneath as a download.',
        position: 'sidebar',
      },
      defaultValue: 'files',
      label: 'Presentation',
      options: [
        { label: 'File list', value: 'files' },
        { label: 'Photo gallery', value: 'gallery' },
      ],
    },
    {
      /**
       * The vanity address, and the one field here that is deliberately *less*
       * secure than what it sits next to.
       *
       * A UUID is unguessable and unmemorable; `prague-2026` is the opposite of
       * both. Setting one trades secrecy for a link that can be read out over
       * dinner, which is the right trade for an album shared with friends and
       * the wrong one for a client's unreleased work. The UUID link never stops
       * working, so nothing is lost by leaving this empty — see the note at the
       * top of `@/lib/commissions/routes`.
       *
       * Normalised in `prepareCommission` rather than here, so that what the
       * unique index sees is what this validator approved.
       */
      name: 'slug',
      type: 'text',
      admin: {
        description:
          'Optional. Gives this a friendly address: “prague-2026” becomes /album/prague-2026. Lowercase letters, numbers and hyphens. Easy to share and therefore easy to guess — add a password if that matters. The UUID link below keeps working either way.',
        position: 'sidebar',
      },
      index: true,
      label: 'Vanity link',
      unique: true,
      validate: (value: null | string | undefined) => {
        const slug = normaliseCommissionSlug(value)

        if (!slug) {
          return true
        }

        return (
          isValidCommissionSlug(slug) ||
          `Use lowercase letters, numbers and hyphens only, up to ${MAX_COMMISSION_SLUG_LENGTH} characters — for example “prague-2026”.`
        )
      },
    },
    {
      /**
       * Readiness gate, off by default — the same rationale as `Media.enabled`:
       * a commission whose upload set is half finished must never be briefly
       * live at a link the artist has already sent.
       *
       * Unlike `Media.enabled`, this one *is* enforced in the read path. There
       * is no separate publication query to hang it off, so
       * `evaluateCommissionGate` in `@/lib/content/commissions` is the single
       * place it is checked, and the page and both public endpoints all go
       * through it.
       */
      name: 'enabled',
      type: 'checkbox',
      admin: {
        description: 'Until this is ticked the public link returns “not available”.',
        position: 'sidebar',
      },
      defaultValue: false,
      index: true,
      label: 'Enabled',
    },
    {
      name: 'expiresAt',
      type: 'date',
      admin: {
        date: { displayFormat: 'dd.MM.yyyy', pickerAppearance: 'dayOnly' },
        description: 'Optional. From this day on the link stops resolving.',
        position: 'sidebar',
      },
      label: 'Expires on',
    },
    {
      name: 'password',
      type: 'text',
      admin: {
        description:
          'Optional second gate on top of the link. Type one and save to set or change it — it is hashed immediately and never stored or shown in plain text, so this box is always empty. Saving with it empty leaves the current password alone; to remove one, tick “Remove password”.',
        position: 'sidebar',
      },
      hooks: {
        // Belt and braces with `prepareCommission`, which nulls the incoming
        // value: this also strips it from anything read back, so a plaintext
        // password cannot surface through the API even if a row somehow held one.
        afterRead: [() => null],
      },
      label: 'Set password',
    },
    {
      name: 'removePassword',
      type: 'checkbox',
      admin: {
        condition: (data) => Boolean(data?.hasPassword),
        description: 'Tick and save to remove the password. Resets itself afterwards.',
        position: 'sidebar',
      },
      defaultValue: false,
      label: 'Remove password',
    },
    {
      name: 'passwordHash',
      type: 'text',
      access: { create: () => false, update: () => false },
      admin: { hidden: true },
    },
    {
      /**
       * Virtual, so the admin panel and the public page can both tell whether a
       * password is set without the hash reaching either of them.
       */
      name: 'hasPassword',
      type: 'checkbox',
      admin: {
        description: 'Whether this commission is password protected.',
        position: 'sidebar',
        readOnly: true,
      },
      hooks: {
        afterRead: [({ data }) => Boolean(data?.passwordHash)],
      },
      label: 'Password protected',
      virtual: true,
    },
    {
      name: 'viewCount',
      type: 'number',
      access: { create: () => false, update: () => false },
      admin: { position: 'sidebar', readOnly: true },
      defaultValue: 0,
      label: 'Views',
    },
    {
      name: 'downloadCount',
      type: 'number',
      access: { create: () => false, update: () => false },
      admin: { position: 'sidebar', readOnly: true },
      defaultValue: 0,
      label: 'Downloads',
    },
    {
      name: 'lastAccessedAt',
      type: 'date',
      access: { create: () => false, update: () => false },
      admin: {
        date: { displayFormat: 'dd.MM.yyyy HH:mm' },
        position: 'sidebar',
        readOnly: true,
      },
      label: 'Last accessed',
    },
    {
      name: 'uuid',
      type: 'text',
      access: { create: () => false, update: () => false },
      admin: {
        description: 'The client-facing address of this commission. Generated once, never changes.',
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
        /**
         * Virtual, so no origin is ever baked into a row — which is what makes
         * the coming `.com` launch a non-event. The link is rebuilt from
         * `APP_URL` on every read, so pointing the deployment at another domain
         * changes every commission link at once, with no migration and no stale
         * rows. A link already sent out keeps working for as long as the old
         * domain resolves, because the UUID is the whole address.
         *
         * The *path* is rebuilt on every read too, so setting a vanity slug
         * changes this link the moment the document is saved. `commissionPath`
         * is the single opinion about which of a commission's two addresses is
         * the canonical one; the UUID route redirects to whatever it says.
         */
        afterRead: [
          ({ data }) => {
            const path = commissionPath({ slug: data?.slug, uuid: data?.uuid })

            return path ? `${getSiteUrl()?.origin ?? ''}${path}` : null
          },
        ],
      },
      label: 'Public link',
      virtual: true,
    },
  ],
  hooks: {
    /**
     * Order matters: the log rows have to go before the commission does, or the
     * delete fails on a foreign key. See `deleteCommissionAccessLog`.
     */
    beforeDelete: [deleteCommissionAccessLog, deleteCommissionObjects],
    beforeValidate: [prepareCommission],
    // No `afterChange` revalidation: the public page is deliberately uncached.
    // See the note at the top of `@/lib/content/commissions`.
  },
}
