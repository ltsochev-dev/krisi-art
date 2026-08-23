import type { GlobalConfig } from 'payload'

import { anyone, editors } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { revalidateGlobal } from '@/lib/hooks/revalidate'

export const Homepage: GlobalConfig = {
  slug: 'homepage',
  access: {
    read: anyone,
    update: editors,
  },
  admin: {
    description: 'Everything rendered on the landing page.',
    group: 'Settings',
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          fields: [
            {
              name: 'heading',
              type: 'text',
              defaultValue: 'Kristina Kostova',
              required: true,
            },
            {
              name: 'subheading',
              type: 'textarea',
            },
            {
              name: 'image',
              type: 'upload',
              admin: {
                description: 'Optional. Leave empty for a text-only hero.',
              },
              relationTo: 'media',
            },
          ],
          label: 'Hero',
        },
        {
          description:
            'The album filter chips and the grid behind them. Chips can be toggled on and off independently — the grid shows every artwork from every selected album.',
          fields: [
            {
              name: 'sectionTitle',
              type: 'text',
              defaultValue: 'Work',
              required: true,
            },
            {
              /**
               * An array rather than a `hasMany` relationship: rows carry both
               * the chip order and whether that chip starts switched on, which a
               * plain relationship list cannot express.
               */
              name: 'albums',
              type: 'array',
              admin: {
                description:
                  'Albums offered as chips, in order. At least one row should start selected, or the grid loads empty.',
                initCollapsed: false,
              },
              fields: [
                {
                  name: 'album',
                  type: 'relationship',
                  filterOptions: () => ({ published: { equals: true } }),
                  relationTo: 'albums',
                  required: true,
                },
                {
                  name: 'selectedByDefault',
                  type: 'checkbox',
                  admin: {
                    description: 'Chip is switched on when the page first loads.',
                  },
                  defaultValue: true,
                },
              ],
              labels: {
                plural: 'Albums',
                singular: 'Album',
              },
              maxRows: 12,
            },
            {
              name: 'imagesPerAlbum',
              type: 'number',
              admin: {
                description:
                  'How many artworks to pull from each selected album on the homepage preview.',
              },
              defaultValue: 8,
              max: 48,
              min: 1,
              required: true,
            },
          ],
          label: 'Gallery',
        },
        {
          fields: [
            {
              name: 'aboutHeading',
              type: 'text',
              defaultValue: 'About',
              required: true,
            },
            {
              name: 'aboutBody',
              type: 'textarea',
              admin: {
                description: 'Plain text. Blank lines separate paragraphs.',
                rows: 10,
              },
            },
            {
              name: 'stats',
              type: 'array',
              admin: {
                description: 'The bullet points beside the about text.',
              },
              defaultValue: [
                { label: 'years of experience', value: '10+' },
                { label: 'projects completed', value: '200+' },
                { label: 'happy clients', value: '50+' },
              ],
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'value',
                      type: 'text',
                      admin: { placeholder: '10+', width: '30%' },
                      required: true,
                    },
                    {
                      name: 'label',
                      type: 'text',
                      admin: { placeholder: 'years of experience', width: '70%' },
                      required: true,
                    },
                  ],
                },
              ],
              maxRows: 6,
              minRows: 1,
            },
            {
              name: 'aboutImages',
              type: 'array',
              admin: {
                description: 'Portraits, studio shots, hobbies. Four reads best.',
              },
              fields: [
                {
                  name: 'image',
                  type: 'upload',
                  relationTo: 'media',
                  required: true,
                },
                {
                  name: 'caption',
                  type: 'text',
                },
              ],
              labels: {
                plural: 'Images',
                singular: 'Image',
              },
              maxRows: 6,
            },
          ],
          label: 'About',
        },
        {
          fields: [
            {
              name: 'metaTitle',
              type: 'text',
              admin: {
                description: 'Falls back to the site name when empty.',
              },
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
          label: 'SEO',
        },
      ],
    },
  ],
  hooks: {
    afterChange: [revalidateGlobal(CACHE_TAGS.homepage)],
  },
}
