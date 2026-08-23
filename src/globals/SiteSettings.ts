import type { GlobalConfig } from 'payload'

import { anyone, editors } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { revalidateGlobal } from '@/lib/hooks/revalidate'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  access: {
    read: anyone,
    update: editors,
  },
  admin: {
    description: 'Site-wide chrome: name, navigation, socials, footer and SEO fallbacks.',
    group: 'Settings',
  },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      defaultValue: 'Kristina Kostova',
      required: true,
    },
    {
      name: 'tagline',
      type: 'text',
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'nav',
      type: 'array',
      admin: {
        description: 'Navbar links, in order.',
      },
      defaultValue: [
        { href: '/#work', label: 'Work' },
        { href: '/#about', label: 'About' },
        { href: '/contact', label: 'Contact' },
      ],
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'label',
              type: 'text',
              admin: { width: '40%' },
              required: true,
            },
            {
              name: 'href',
              type: 'text',
              admin: {
                description: 'A path (/contact), a hash (/#about) or an absolute URL.',
                width: '60%',
              },
              required: true,
            },
          ],
        },
      ],
      labels: {
        plural: 'Links',
        singular: 'Link',
      },
      maxRows: 8,
    },
    {
      name: 'socials',
      type: 'array',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'platform',
              type: 'select',
              admin: { width: '40%' },
              options: [
                { label: 'Instagram', value: 'instagram' },
                { label: 'Facebook', value: 'facebook' },
                { label: 'Behance', value: 'behance' },
                { label: 'LinkedIn', value: 'linkedin' },
                { label: 'Pinterest', value: 'pinterest' },
                { label: 'TikTok', value: 'tiktok' },
                { label: 'YouTube', value: 'youtube' },
                { label: 'Other', value: 'other' },
              ],
              required: true,
            },
            {
              name: 'url',
              type: 'text',
              admin: { width: '60%' },
              required: true,
            },
          ],
        },
      ],
      labels: {
        plural: 'Socials',
        singular: 'Social',
      },
      maxRows: 10,
    },
    {
      name: 'footerText',
      type: 'text',
      admin: {
        description: 'Shown beside the copyright line.',
      },
    },
    {
      name: 'seo',
      type: 'group',
      admin: {
        description: 'Used wherever a page does not set its own.',
      },
      fields: [
        {
          name: 'metaTitle',
          type: 'text',
        },
        {
          name: 'metaDescription',
          type: 'textarea',
        },
        {
          name: 'ogImage',
          type: 'upload',
          relationTo: 'media',
        },
      ],
      label: 'Default SEO',
    },
  ],
  hooks: {
    afterChange: [revalidateGlobal(CACHE_TAGS.siteSettings)],
  },
}
