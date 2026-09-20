/**
 * Root layout for every client-facing commission surface — the file list at
 * `/commission/<uuid>` and the photo album at `/album/<slug>`.
 *
 * It is in a route group of its own, sibling to `(frontend)` and `(invoice)`,
 * rather than nested inside the site's layout — because it needs a different
 * `<html>`. The site's shell wraps everything in a navbar, a footer and an
 * unconditionally dark palette, and a page whose entire job is a legible file
 * list on somebody's phone wants none of the three. Next allows several root
 * layouts as long as their route paths do not collide, and `/commission/...`
 * and `/album/...` are exclusively ours.
 *
 * It sits at the **group** root rather than under `commission/[uuid]`, where it
 * used to live, so that both routes share one `<html>`, one stylesheet and one
 * set of robots directives. A second copy under `album/[slug]` would be a copy
 * that could drift — and the directive it could drift on is `noindex`.
 *
 * Two differences from the invoice layout it is modelled on:
 *
 * - `lang` is a constant. These pages are English only (see the plan's decision
 *   table), so there is no per-document language to read.
 * - It does **no database read at all**. The invoice layout has to look its
 *   document up to know what language to print in; there is nothing here that
 *   depends on the commission, and the commission read is uncached, so a lookup
 *   in this file would be a second query per request bought for nothing. The
 *   pages and the not-found page do all the resolving.
 */
import type { Metadata } from 'next'

import React from 'react'

import { fontVariables } from '@/lib/fonts'

import './commission.css'

/**
 * Nothing on these routes may be prerendered: the pages read the database
 * through the Local API and, when a password is set, the request's own cookies.
 * There is no `PAYLOAD_SECRET` or migrated volume in the Docker builder stage
 * either, so this is also what the `(frontend)` and `(invoice)` routes do.
 */
export const dynamic = 'force-dynamic'

/**
 * Never indexed, and no link preview.
 *
 * For a commission the URL is unguessable and that — plus an optional password
 * — is the whole access control story. For an album the URL is a slug someone
 * chose to be memorable, which makes these directives matter *more* rather than
 * less: `prague-2026` would be trivially findable the moment a crawler put it
 * in an index. `nocache` and `noimageindex` are belt-and-braces for crawlers
 * that honour some directives and not others, and the second one is doing real
 * work on a page that is nothing but photographs.
 *
 * The title is a fallback for the not-found case; each page sets its own.
 */
export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
    nocache: true,
    noimageindex: true,
  },
  title: 'Files',
}

export default function CommissionLayout({ children }: { children: React.ReactNode }) {
  return (
    <html className={fontVariables} lang="en">
      <body>{children}</body>
    </html>
  )
}
