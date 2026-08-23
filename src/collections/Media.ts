import type { CollectionConfig } from 'payload'

import { admins, anyone, editors } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { revalidateCollection, revalidateCollectionDelete } from '@/lib/hooks/revalidate'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: editors,
    delete: admins,
    read: anyone,
    update: editors,
  },
  admin: {
    defaultColumns: ['filename', 'alt', 'mimeType', 'filesize', 'updatedAt'],
    group: 'Content',
    useAsTitle: 'alt',
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      admin: {
        description: 'Describe the image for screen readers and search engines.',
      },
      required: true,
    },
    {
      name: 'caption',
      type: 'text',
    },
  ],
  hooks: {
    afterChange: [revalidateCollection(CACHE_TAGS.media, CACHE_TAGS.homepage)],
    afterDelete: [revalidateCollectionDelete(CACHE_TAGS.media, CACHE_TAGS.homepage)],
  },
  /**
   * `sharp` is passed to `buildConfig`, so declaring `imageSizes` makes Payload
   * resize on every write and store each derivative next to the original (in S3,
   * via the storage plugin). The generated names surface as `media.sizes.*` in
   * `payload-types.ts`, which is what the gallery query selects.
   *
   * Note this only ever happens on write — existing uploads gain nothing
   * retroactively. A no-op `payload.update` per media doc re-runs the pipeline if
   * a bulk regenerate is ever needed.
   */
  upload: {
    adminThumbnail: 'thumbnail',
    crop: true,
    focalPoint: true,
    imageSizes: [
      {
        // Fixed square, honouring the focal point, so admin lists and any chip
        // previews line up regardless of the original's aspect ratio.
        name: 'thumbnail',
        formatOptions: { format: 'webp', options: { quality: 75 } },
        height: 400,
        position: 'centre',
        width: 400,
      },
      {
        // Gallery grid. Width-only so portraits stay portrait.
        name: 'card',
        formatOptions: { format: 'webp', options: { quality: 80 } },
        height: undefined,
        width: 768,
        withoutEnlargement: true,
      },
      {
        name: 'tablet',
        height: undefined,
        width: 1024,
        withoutEnlargement: true,
      },
      {
        // Lightbox / hero.
        name: 'hero',
        height: undefined,
        width: 1920,
        withoutEnlargement: true,
      },
    ],
    /**
     * Images only. `imageSizes` is meaningless for other types and downstream
     * code assumes `sizes` is populated — if a PDF (a CV, say) is ever needed,
     * add a separate `documents` upload collection rather than widening this.
     */
    mimeTypes: ['image/*'],
  },
}
