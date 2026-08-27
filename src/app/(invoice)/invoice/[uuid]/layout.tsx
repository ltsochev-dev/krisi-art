/**
 * Root layout for the client-facing invoice page.
 *
 * Two things about where this file sits.
 *
 * It is in a route group of its own, sibling to `(frontend)` and `(payload)`,
 * rather than nested inside the site's layout — because it needs a different
 * `<html>`. The site's shell wraps everything in a navbar, a footer and an
 * unconditionally dark palette; an invoice needs none of those and actively cannot
 * have the last one, since it exists to be printed. Next allows several root
 * layouts as long as their route paths do not collide, and `/invoice/...` is
 * exclusively ours.
 *
 * It is also *under* the `[uuid]` segment rather than at the top of the group,
 * which is unusual for a root layout and deliberate: `lang` on `<html>` has to be
 * the language the invoice is actually printed in, and only a layout that can see
 * the UUID can look that up. Next supports this — any layout with no layout above
 * it is a root layout, including one under a dynamic segment. The lookup costs
 * nothing extra: `getInvoiceByUuid` is cached, so the page's own call hits the same
 * entry.
 */
import type { Metadata } from 'next'

import React from 'react'

import { fontVariables } from '@/lib/fonts'
import { getInvoiceByUuid } from '@/lib/content/queries'
import { DEFAULT_INVOICE_LANGUAGE } from '@/lib/invoicing/options'

import '../../invoice.css'

/**
 * Reads the database through the Local API on every request, exactly as the
 * `(frontend)` routes do, and for the same reason: there is no `PAYLOAD_SECRET`
 * or migrated volume in the Docker builder stage, so nothing here can be
 * prerendered. The cached read in `@/lib/content/queries` is what keeps it cheap.
 */
export const dynamic = 'force-dynamic'

/**
 * Never indexed, and no link preview.
 *
 * The URL is unguessable and that is the whole access control story — so the one
 * thing that must not happen is a crawler putting a client's invoice, with their
 * address and tax number on it, into a search index. `nocache` and `noimageindex`
 * are belt-and-braces for crawlers that honour some directives and not others.
 *
 * The title is a fallback for the not-found case; the page sets its own, in the
 * invoice's language.
 */
export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
    nocache: true,
    noimageindex: true,
  },
  title: 'Фактура / Invoice',
}

export default async function InvoiceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ uuid: string }>
}) {
  const { uuid } = await params
  const invoice = await getInvoiceByUuid(uuid)

  // No invoice means the not-found page is about to render, and it addresses a
  // reader whose language we have no way of knowing — so it says both, under the
  // artist's own.
  const language = invoice?.language ?? DEFAULT_INVOICE_LANGUAGE

  return (
    <html className={fontVariables} lang={language}>
      <body>{children}</body>
    </html>
  )
}
