/**
 * The Terms and Privacy Policy pages.
 *
 * Both are linked from the site chrome, so the documents have to exist even on a
 * fresh database — a footer link to a 404 is worse than a placeholder. Created by
 * `onInit` in `payload.config.ts`, the same way `ensureDefaultAlbum` seeds the
 * fallback album.
 *
 * The bodies below are deliberately placeholder text. Seeding only ever *creates*
 * — an existing page is left exactly as the editor last saved it, so real legal
 * copy is never overwritten by a redeploy.
 */
import type { Payload, PayloadRequest } from 'payload'

import type { Page } from '@/payload-types'

/**
 * A minimal Lexical editor state.
 *
 * Hand-built rather than converted from Markdown: the placeholder is a couple of
 * plain paragraphs, and this keeps the seeder free of the editor config that
 * `convertMarkdownToLexical` would need. The shape is Lexical's own serialised
 * format, so the admin editor loads it like anything it saved itself.
 */
const richText = (...paragraphs: string[]): NonNullable<Page['content']> => ({
  root: {
    type: 'root',
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      children: [
        {
          type: 'text',
          detail: 0,
          format: 0,
          mode: 'normal',
          style: '',
          text,
          version: 1,
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      textFormat: 0,
      version: 1,
    })),
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

export const TERMS_PAGE_SLUG = 'terms'
export const PRIVACY_PAGE_SLUG = 'privacy'

type SeedPage = {
  content: NonNullable<Page['content']>
  slug: string
  title: string
}

const LEGAL_PAGES: readonly SeedPage[] = [
  {
    content: richText(
      'Placeholder terms of service. These terms have not been written yet and carry no legal weight.',
      'Replace this text in the admin panel before the site goes live.',
    ),
    slug: TERMS_PAGE_SLUG,
    title: 'Terms of Service',
  },
  {
    content: richText(
      'Placeholder privacy policy. This page does not yet describe what data the site collects or how it is handled.',
      'Replace this text in the admin panel before the site goes live.',
    ),
    slug: PRIVACY_PAGE_SLUG,
    title: 'Privacy Policy',
  },
]

type Ctx = {
  payload: Payload
  /** Pass through from a hook so the reads join that hook's transaction. */
  req?: PayloadRequest
}

const findBySlug = async ({ payload, req }: Ctx, slug: string): Promise<Page | undefined> => {
  const { docs } = await payload.find({
    collection: 'pages',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    where: { slug: { equals: slug } },
  })

  return docs[0]
}

/**
 * Creates any legal page that is missing, and returns the full set.
 *
 * The slug is unique, so a race means the loser's create throws and we re-read
 * rather than ending up with a duplicate — same pattern as the default album.
 */
export const ensureLegalPages = async (ctx: Ctx): Promise<Page[]> => {
  const pages: Page[] = []

  for (const seed of LEGAL_PAGES) {
    const existing = await findBySlug(ctx, seed.slug)

    if (existing) {
      pages.push(existing)
      continue
    }

    try {
      pages.push(
        await ctx.payload.create({
          collection: 'pages',
          // Nothing is rendering yet during init, so there is nothing to bust.
          context: { disableRevalidate: true },
          data: {
            content: seed.content,
            // Placeholder copy should not be live. An editor publishes the page
            // once the real text is in.
            published: false,
            slug: seed.slug,
            title: seed.title,
          },
          depth: 0,
          overrideAccess: true,
          req: ctx.req,
        }),
      )
    } catch (error) {
      const raced = await findBySlug(ctx, seed.slug)

      if (!raced) {
        throw error
      }

      pages.push(raced)
    }
  }

  return pages
}
