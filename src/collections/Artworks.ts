import type { CollectionConfig } from 'payload'

import { galleryEndpoint } from '@/endpoints/gallery'
import { admins, editors, publishedOrEditor } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { getDefaultAlbumId } from '@/lib/content/default-album'
import { revalidateCollection, revalidateCollectionDelete } from '@/lib/hooks/revalidate'

export const Artworks: CollectionConfig = {
  slug: 'artworks',
  access: {
    create: editors,
    delete: admins,
    read: publishedOrEditor,
    update: editors,
  },
  admin: {
    defaultColumns: ['title', 'album', 'sortOrder', 'published', 'updatedAt'],
    description:
      'One row per piece. The image itself lives in Media — an artwork wraps it with the album, ordering and caption metadata the gallery needs.',
    group: 'Content',
    listSearchableFields: ['title', 'medium'],
    useAsTitle: 'title',
  },
  defaultSort: 'sortOrder',
  endpoints: [galleryEndpoint],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'album',
      type: 'relationship',
      admin: {
        description: 'Defaults to Uncategorized.',
      },
      // Resolved per create, so a fresh database does not need seeding first.
      defaultValue: async ({ req }) => await getDefaultAlbumId({ payload: req.payload, req }),
      index: true,
      relationTo: 'albums',
      required: true,
    },
    {
      name: 'sortOrder',
      type: 'number',
      admin: {
        description: 'Position within the album. Lower numbers come first.',
        position: 'sidebar',
      },
      defaultValue: 0,
      index: true,
      required: true,
    },
    {
      name: 'published',
      type: 'checkbox',
      admin: {
        description: 'Unpublished artworks are invisible to the public API.',
        position: 'sidebar',
      },
      defaultValue: true,
      index: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'year',
          type: 'number',
          admin: { width: '33%' },
        },
        {
          name: 'medium',
          type: 'text',
          admin: {
            placeholder: 'Oil on canvas',
            width: '33%',
          },
        },
        {
          name: 'dimensions',
          type: 'text',
          admin: {
            placeholder: '60 × 80 cm',
            width: '33%',
          },
        },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      admin: {
        description: 'Optional story behind the piece.',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      admin: {
        description: 'Cross-album labels, independent of which album the piece is filed under.',
      },
      hasMany: true,
      relationTo: 'tags',
    },
  ],
  hooks: {
    afterChange: [revalidateCollection(CACHE_TAGS.artworks, CACHE_TAGS.homepage)],
    afterDelete: [revalidateCollectionDelete(CACHE_TAGS.artworks, CACHE_TAGS.homepage)],
    beforeChange: [
      async ({ data, req }) => {
        // `defaultValue` only fires when the field is absent from the incoming
        // payload. An explicit `album: null` — which is what a cleared select in
        // the admin sends — would otherwise fail the required check.
        if (!data.album) {
          data.album = await getDefaultAlbumId({ payload: req.payload, req })
        }

        return data
      },
    ],
  },
}
