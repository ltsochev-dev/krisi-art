import type { CollectionConfig } from 'payload'

import { APIError, slugField } from 'payload'

import { admins, editors, publishedOrEditor } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { ensureDefaultAlbum } from '@/lib/content/default-album'
import { revalidateCollection, revalidateCollectionDelete } from '@/lib/hooks/revalidate'

export const Albums: CollectionConfig = {
  slug: 'albums',
  access: {
    create: editors,
    delete: admins,
    read: publishedOrEditor,
    update: editors,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'published', 'updatedAt'],
    description:
      'Groups of artworks. Albums become the filter chips on the homepage gallery; drag the rows to reorder the chips.',
    group: 'Content',
    useAsTitle: 'title',
  },
  // Drag-and-drop ordering in the list view. Payload maintains the `_order`
  // field with fractional indexing, so a reorder writes one row rather than
  // renumbering the table. `defaultSort` has to be `_order` for the drag handle
  // to appear at all.
  defaultSort: '_order',
  orderable: true,
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    // Experimental helper, but the behaviour we want: generate from the title on
    // create, then stop regenerating so a published URL/query value is stable.
    slugField({ useAsSlug: 'title' }),
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'published',
      type: 'checkbox',
      admin: {
        description: 'Unpublished albums are invisible to the public API.',
        position: 'sidebar',
      },
      defaultValue: true,
      index: true,
    },
    {
      name: 'isDefault',
      type: 'checkbox',
      access: {
        // Only `ensureDefaultAlbum` may set this, and only at creation.
        create: () => false,
        update: () => false,
      },
      admin: {
        description: 'Marks the fallback album that artworks land in. Cannot be deleted.',
        position: 'sidebar',
        readOnly: true,
      },
      defaultValue: false,
      index: true,
      label: 'Default album',
    },
    {
      name: 'artworks',
      type: 'join',
      admin: {
        defaultColumns: ['title', 'published'],
        description: 'Artworks filed into this album. Drag the rows to set the order they appear in the gallery.',
      },
      collection: 'artworks',
      // Ordering lives here rather than on the collection: an artwork's position
      // only means anything relative to the other artworks in its album, and
      // this is the one screen where that context exists. Payload adds a
      // per-album fractional index to `artworks` for it and points the join's
      // `defaultSort` at that field — see `ARTWORK_ORDER_FIELD`.
      on: 'album',
      orderable: true,
    },
  ],
  hooks: {
    afterChange: [revalidateCollection(CACHE_TAGS.albums, CACHE_TAGS.homepage)],
    afterDelete: [
      revalidateCollectionDelete(CACHE_TAGS.albums, CACHE_TAGS.artworks, CACHE_TAGS.homepage),
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const album = await req.payload.findByID({
          collection: 'albums',
          depth: 0,
          id,
          overrideAccess: true,
          req,
        })

        if (album.isDefault) {
          throw new APIError(
            'The default album cannot be deleted — artworks fall back to it when their album is removed.',
            400,
            undefined,
            true,
          )
        }

        const fallback = await ensureDefaultAlbum({ payload: req.payload, req })

        // `artworks.album` is required, so the rows have to be moved before the
        // album row disappears or the relationship dangles. `req` is threaded
        // through so this joins the delete's transaction when one is active.
        const { docs: orphans } = await req.payload.find({
          collection: 'artworks',
          depth: 0,
          overrideAccess: true,
          pagination: false,
          req,
          where: { album: { equals: id } },
        })

        for (const orphan of orphans) {
          await req.payload.update({
            collection: 'artworks',
            // One cache bust after the delete is enough; skip the per-row churn.
            context: { disableRevalidate: true },
            data: { album: fallback.id },
            id: orphan.id,
            overrideAccess: true,
            req,
          })
        }

        if (orphans.length > 0) {
          req.payload.logger.info(
            `Moved ${orphans.length} artwork(s) from deleted album ${id} to "${fallback.title}".`,
          )
        }
      },
    ],
    beforeValidate: [
      ({ data, operation, originalDoc }) => {
        if (operation !== 'update' || !originalDoc?.isDefault) {
          return data
        }

        // Field-level access already blocks writes to `isDefault`, but the slug
        // is a normal editable field and the fallback is looked up by flag, not
        // by slug — so guard the slug explicitly rather than relying on that.
        if (data?.slug && data.slug !== originalDoc.slug) {
          throw new APIError(
            `The default album's slug is fixed at "${originalDoc.slug}".`,
            400,
            undefined,
            true,
          )
        }

        return data
      },
    ],
  },
}
