import type { CollectionConfig } from 'payload'

import { slugField } from 'payload'

import { admins, anyone, editors } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { revalidateCollection, revalidateCollectionDelete } from '@/lib/hooks/revalidate'

export const Tags: CollectionConfig = {
  slug: 'tags',
  access: {
    create: editors,
    delete: admins,
    // Tags carry no editorial state of their own — they are only meaningful
    // attached to an artwork, and that artwork's own `published` flag gates it.
    read: anyone,
    update: editors,
  },
  admin: {
    defaultColumns: ['name', 'slug', 'updatedAt'],
    description: 'Cross-album labels for artworks, e.g. "oil", "portrait".',
    group: 'Content',
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      unique: true,
    },
    slugField({ useAsSlug: 'name' }),
  ],
  hooks: {
    afterChange: [revalidateCollection(CACHE_TAGS.tags, CACHE_TAGS.artworks)],
    afterDelete: [revalidateCollectionDelete(CACHE_TAGS.tags, CACHE_TAGS.artworks)],
  },
}
