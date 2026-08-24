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
            {
              /**
               * An array of one-field rows rather than a `select` or a
               * comma-separated `text`: rows are what give the admin panel its
               * drag handles, so the editor controls both the wording and the
               * order the chips appear in. Row order is the render order.
               */
              name: 'skills',
              type: 'array',
              admin: {
                description:
                  'Disciplines shown as chips under the hero text. Drag the rows to reorder them.',
                initCollapsed: false,
              },
              defaultValue: [
                { label: 'Traditional Painting' },
                { label: 'Digital Art' },
                { label: 'Comic Books' },
                { label: 'Game Art' },
                { label: 'Concept Art' },
              ],
              fields: [
                {
                  name: 'label',
                  type: 'text',
                  admin: { placeholder: 'Concept Art' },
                  required: true,
                },
              ],
              labels: {
                plural: 'Skills',
                singular: 'Skill',
              },
              maxRows: 12,
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
              name: 'sectionSubtitle',
              type: 'textarea',
              admin: {
                description: 'Plain text. Blank lines separate paragraphs.',
                rows: 4,
              },
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
                  'Albums offered as chips, in this order. The first row is the chip selected when the page loads; "All" sits at the end of the row.',
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
                    description:
                      'No longer used — the first album in this list is the one selected on load. Move an album to the top instead.',
                    readOnly: true,
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
              name: 'contactsHeading',
              type: 'text',
              defaultValue: "Let's Create Together",
              required: true,
            },
            {
              name: 'contactsSubtitle',
              defaultValue:
                "Interested in commissioning a piece or collaborating on a project? I'd love to hear about your vision.",
              type: 'textarea',
              admin: {
                description: 'Plain text. Blank lines separate paragraphs.',
                rows: 10,
              },
            },
          ],
          label: 'Contacts',
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
