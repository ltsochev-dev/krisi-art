import type { CollectionConfig } from 'payload'

import { admins, editors } from '@/lib/auth/access'

/** Nothing in the admin panel or over REST may edit what the visitor submitted. */
const serverOwned = { create: () => false, update: () => false }

export const ContactSubmissions: CollectionConfig = {
  slug: 'contact-submissions',
  access: {
    /**
     * The public never writes here directly. The only writer is the
     * `submitContactForm` server action, which goes through the Local API and so
     * bypasses access control by design — see `@/lib/actions/contact`.
     */
    create: () => false,
    delete: admins,
    read: editors,
    update: editors,
  },
  admin: {
    defaultColumns: ['email', 'name', 'subject', 'status', 'createdAt'],
    description: 'Messages sent through the contact form. Read-only apart from the status.',
    group: 'Inbox',
    useAsTitle: 'email',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'name',
          type: 'text',
          access: serverOwned,
          admin: { readOnly: true, width: '50%' },
          required: true,
        },
        {
          name: 'email',
          type: 'email',
          access: serverOwned,
          admin: { readOnly: true, width: '50%' },
          required: true,
        },
      ],
    },
    {
      name: 'subject',
      type: 'text',
      access: serverOwned,
      admin: { readOnly: true },
    },
    {
      name: 'message',
      type: 'textarea',
      access: serverOwned,
      admin: { readOnly: true, rows: 10 },
      required: true,
    },
    {
      name: 'status',
      type: 'select',
      admin: {
        description: 'The only field staff are meant to change.',
        position: 'sidebar',
      },
      defaultValue: 'new',
      index: true,
      options: [
        { label: 'New', value: 'new' },
        { label: 'Read', value: 'read' },
        { label: 'Replied', value: 'replied' },
        { label: 'Archived', value: 'archived' },
      ],
      required: true,
    },
    {
      name: 'emailSent',
      type: 'checkbox',
      access: serverOwned,
      admin: {
        description: 'Whether the notification email left the building.',
        position: 'sidebar',
        readOnly: true,
      },
      defaultValue: false,
      label: 'Notification sent',
    },
    {
      name: 'emailError',
      type: 'text',
      access: serverOwned,
      admin: {
        condition: (data) => Boolean(data?.emailError),
        position: 'sidebar',
        readOnly: true,
      },
      label: 'Notification error',
    },
    {
      name: 'userAgent',
      type: 'text',
      access: serverOwned,
      admin: {
        description: 'Captured for spam triage only.',
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
}
