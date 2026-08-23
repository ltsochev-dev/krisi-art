import type { GlobalConfig } from 'payload'

import { anyone, editors } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { revalidateGlobal } from '@/lib/hooks/revalidate'

export const ContactPage: GlobalConfig = {
  slug: 'contact-page',
  access: {
    read: anyone,
    update: editors,
  },
  admin: {
    description: 'Contact page copy, published contact details, and who gets notified.',
    group: 'Settings',
  },
  fields: [
    {
      name: 'heading',
      type: 'text',
      defaultValue: 'Contact',
      required: true,
    },
    {
      name: 'intro',
      type: 'textarea',
    },
    {
      type: 'collapsible',
      fields: [
        {
          name: 'displayEmail',
          type: 'email',
          admin: {
            description: 'Shown on the page. Not necessarily where the form sends.',
          },
        },
        {
          name: 'phone',
          type: 'text',
        },
        {
          name: 'location',
          type: 'text',
          admin: {
            placeholder: 'Sofia, Bulgaria',
          },
        },
      ],
      label: 'Published details',
    },
    {
      type: 'collapsible',
      fields: [
        {
          name: 'formIntro',
          type: 'textarea',
          admin: {
            description: 'Short line above the form fields.',
          },
        },
        {
          name: 'successMessage',
          type: 'text',
          defaultValue: 'Thanks — your message is on its way.',
          required: true,
        },
        {
          name: 'notifyRecipients',
          type: 'array',
          admin: {
            description:
              'Where submissions are emailed. Falls back to RESEND_FROM_ADDRESS when empty — the message is still saved either way.',
          },
          fields: [
            {
              name: 'email',
              type: 'email',
              required: true,
            },
          ],
          labels: {
            plural: 'Recipients',
            singular: 'Recipient',
          },
          maxRows: 5,
        },
      ],
      label: 'Form',
    },
  ],
  hooks: {
    afterChange: [revalidateGlobal(CACHE_TAGS.contactPage)],
  },
}
