import { admins, editors, published } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { revalidateCollection, revalidateCollectionDelete } from '@/lib/hooks/revalidate'
import { CollectionConfig } from 'payload'

export const Testimonials: CollectionConfig = {
  slug: 'testimonials',
  access: {
    create: editors,
    delete: admins,
    read: published,
    update: editors,
  },
  admin: {
    defaultColumns: ['name', 'testimonial', 'published', 'updatedAt'],
    description:
      'Groups of testimonials. Testimonials are displayed on the homepage; drag the rows to reorder them.',
    group: 'Content',
    useAsTitle: 'name',
  },
  // Drag-and-drop ordering in the list view, replacing the old `sortOrder`
  // integers. Payload maintains `_order` with fractional indexing, so a reorder
  // writes one row rather than renumbering the table. `defaultSort` has to be
  // `_order` for the drag handle to appear at all.
  defaultSort: '_order',
  orderable: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Client Name',
      required: true,
    },
    {
      name: 'testimonial',
      type: 'textarea',
      admin: {
        description: 'Plain text.',
        rows: 10,
      },
      required: true,
    },
    {
      name: 'socials',
      type: 'array',
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
            { label: 'ArtStation', value: 'artstation' },
            { label: 'Other', value: 'other' },
          ],
          required: true,
        },
        {
          name: 'href',
          type: 'text',
        },
      ],
    },
    {
      name: 'rating',
      type: 'number',
      admin: {
        description: 'Not displayed. Used internally.',
        position: 'sidebar',
      },
    },
    {
      name: 'published',
      type: 'checkbox',
      admin: {
        description: 'Unpublished testimonials are invisible to the public API.',
        position: 'sidebar',
      },
      defaultValue: true,
      index: true,
    },
  ],
  hooks: {
    afterChange: [revalidateCollection(CACHE_TAGS.testimonials, CACHE_TAGS.homepage)],
    afterDelete: [
      revalidateCollectionDelete(CACHE_TAGS.testimonials, CACHE_TAGS.artworks, CACHE_TAGS.homepage),
    ],
  },
}
