/**
 * Standalone copy pages — `/terms`, `/privacy` and anything else in the `pages`
 * collection.
 *
 * A single dynamic segment serves the lot. `getPage` filters to published, so an
 * unpublished page is a 404 rather than a preview: there is no draft mode here.
 *
 * The body is Lexical rich text, rendered with the converter that ships with
 * `@payloadcms/richtext-lexical` rather than a hand-rolled walker. Its heading
 * and list styles live in `../globals.css` under `.rich-text` — Preflight resets
 * headings to `inherit`, so CMS prose needs the scale put back explicitly.
 *
 * Server-rendered throughout, with no `motion` reveal. The animated sections on
 * the homepage each sit behind a client boundary; a page that is nothing but
 * text would have to push its whole body across that boundary to buy an
 * animation it does not need.
 */
import type { Metadata } from 'next'

import React from 'react'

import { RichText } from '@payloadcms/richtext-lexical/react'
import { notFound } from 'next/navigation'

import { getPage, getSiteSettings } from '@/lib/content/queries'
import { pageMetadata } from '@/lib/seo/metadata'

type Props = { params: Promise<{ slug: string }> }

const updatedOn = (timestamp: string): string =>
  new Intl.DateTimeFormat('en-GB', { dateStyle: 'long' }).format(new Date(timestamp))

/**
 * The `pages` collection has a title and a body, no SEO fields — so the title is
 * the page's and the description falls through to the site default. A rich-text
 * body is the wrong thing to derive a `<meta>` description from: it would take
 * flattening Lexical to plain text and would read as a truncated first sentence.
 *
 * Nothing to override when the page is missing — the 404 renders under the
 * layout's own title.
 */
export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { slug } = await params
  const [page, settings] = await Promise.all([getPage(slug), getSiteSettings()])

  return page ? pageMetadata({ path: `/${page.slug}`, settings, title: page.title }) : {}
}

export default async function CopyPage({ params }: Props) {
  const { slug } = await params
  const page = await getPage(slug)

  if (!page) {
    notFound()
  }

  return (
    <article className="relative overflow-hidden bg-background py-24 md:py-32">
      {/* Same gradient the hero opens with, so a page reached straight from the
          footer still reads as part of the site. */}
      <div className="absolute inset-x-0 top-0 h-64 bg-linear-to-b from-charcoal-deep to-background" />

      <div className="relative z-10 container mx-auto px-6">
        <header className="mx-auto max-w-3xl text-center">
          <h1 className="mb-4 font-serif text-4xl text-foreground md:text-5xl">{page.title}</h1>
          <div className="section-divider mb-6" />
          <p className="font-sans text-xs tracking-widest text-muted-foreground uppercase">
            Last updated {updatedOn(page.updatedAt)}
          </p>
        </header>

        {page.content ? (
          <RichText className="rich-text mx-auto mt-16 max-w-3xl" data={page.content} />
        ) : null}
      </div>
    </article>
  )
}
