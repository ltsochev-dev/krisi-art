import type { CollectionConfig } from 'payload'

import { getMediaCdnUrl, joinCdnFileURL } from '@/lib/aws/s3'
import { admins, anyone, editors } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { revalidateCollection, revalidateCollectionDelete } from '@/lib/hooks/revalidate'

/**
 * Admin list/preview thumbnail, resolved by hand rather than with the shorthand
 * `adminThumbnail: 'thumbnail'`.
 *
 * The shorthand builds the URL from the *stored* `sizes.thumbnail.url` column,
 * which is untouched by the storage plugin's `afterRead` rewrite — that only
 * fixes up the value on its way out to an API response. Any document uploaded
 * before `S3_CDN_URL` existed still has `/api/media/file/...` in the column, and
 * `disablePayloadAccessControl` (which the CDN path turns on) removes that route
 * — so every one of those thumbnails 404s in the admin panel while the same
 * image loads fine on the site. Deriving the URL from `filename`, exactly as
 * `generateFileURL` does, makes the stored column irrelevant.
 *
 * Returning `null` (no filename at all) leaves Payload showing its generic file
 * icon, which is the same thing the built-in resolver does.
 */
const adminThumbnail = ({ doc }: { doc: Record<string, unknown> }): null | string => {
  const sizes = doc.sizes as undefined | { thumbnail?: { filename?: null | string } }
  const filename = sizes?.thumbnail?.filename || (doc.filename as null | string | undefined)

  if (!filename) {
    return null
  }

  const cdnUrl = getMediaCdnUrl()
  const prefix = (doc.prefix as string | undefined) || undefined

  // No CDN means the plugin never disabled Payload's own file route, so the
  // route that the built-in resolver would have pointed at still serves bytes.
  return cdnUrl
    ? joinCdnFileURL(cdnUrl, filename, prefix)
    : `/api/media/file/${encodeURIComponent(filename)}`
}

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: editors,
    delete: admins,
    read: anyone,
    update: editors,
  },
  admin: {
    defaultColumns: ['filename', 'alt', 'enabled', 'mimeType', 'filesize', 'updatedAt'],
    group: 'Content',
    useAsTitle: 'alt',
  },
  fields: [
    {
      /**
       * Readiness gate, deliberately off by default.
       *
       * An upload is not publishable the moment the bytes land — the alt text,
       * caption and crop all get filled in afterwards. Defaulting to `false`
       * means a half-finished image is never briefly live: it appears on the
       * site only once someone ticks this.
       *
       * Enforced in `@/lib/content/gallery`, not in access control, because the
       * frontend reads everything with `overrideAccess: true` and would bypass
       * an access constraint. See `toGalleryImage` and `findGalleryArtworks`.
       */
      name: 'enabled',
      type: 'checkbox',
      admin: {
        description:
          'Off until the image is ready. Disabled images are hidden everywhere on the site, and any artwork using one drops out of the gallery.',
        position: 'sidebar',
      },
      defaultValue: false,
      index: true,
    },
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
    adminThumbnail,
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
