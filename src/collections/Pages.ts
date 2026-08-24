import type { CollectionConfig } from 'payload'

import { slugField } from 'payload'

import { admins, editors, publishedOrEditor } from '@/lib/auth/access'
import { CACHE_TAGS } from '@/lib/content/cache-tags'
import { revalidateCollection, revalidateCollectionDelete } from '@/lib/hooks/revalidate'

/**
 * Standalone copy pages, addressed by slug at the site root — `/terms`,
 * `/privacy` and whatever legal or informational page comes next.
 *
 * A collection rather than a global per page: the set is open-ended, and the
 * frontend renders all of them through one `[slug]` route, so a new page is a
 * new document rather than new code. The two the site needs are seeded by
 * `ensureLegalPages` — see `@/lib/content/legal-pages`.
 */
export const Pages: CollectionConfig = {
  slug: 'pages',
  access: {
    create: editors,
    delete: admins,
    read: publishedOrEditor,
    update: editors,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'published', 'updatedAt'],
    description: 'Standalone pages such as Terms and Privacy Policy, addressed by their slug.',
    group: 'Content',
    useAsTitle: 'title',
  },
  defaultSort: 'title',
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    // Same helper and the same reasoning as Albums: generate from the title on
    // create, then leave it alone so a URL that is already published stays put.
    slugField({ useAsSlug: 'title' }),
    {
      name: 'content',
      type: 'richText',
      admin: {
        description: 'The body of the page. Formatting comes through to the frontend.',
      },
    },
    {
      name: 'published',
      type: 'checkbox',
      admin: {
        description: 'Unpublished pages are invisible to the public API and 404 on the site.',
        position: 'sidebar',
      },
      defaultValue: true,
      index: true,
    },
  ],
  hooks: {
    afterChange: [revalidateCollection(CACHE_TAGS.pages)],
    afterDelete: [revalidateCollectionDelete(CACHE_TAGS.pages)],
  },
}
