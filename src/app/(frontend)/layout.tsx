/**
 * Frontend shell.
 *
 * Deliberately unstyled for now — this is a data preview, not a design. The
 * point of interest is that the chrome (site name, nav, socials, footer) comes
 * from the `site-settings` global through the cached read helper, so every
 * route under `(frontend)` gets it without fetching anything itself.
 */
import type { Metadata } from 'next'

import Link from 'next/link'
import React from 'react'

import { getSiteSettings } from '@/lib/content/queries'
import { fontVariables } from '@/lib/fonts'

// Tailwind, loaded here only. The Payload admin has its own root layout and
// stylesheet, so the reset in here never reaches it.
import './globals.css'

/**
 * Every route under `(frontend)` reads the database through the Payload Local
 * API, so none of them can be prerendered: the build runs in the Docker builder
 * stage, where there is no `PAYLOAD_SECRET` (compose's `env_file` is runtime
 * only, and `.env` is dockerignored) and no migrated SQLite volume. Rendering
 * per request is also what we want regardless — the cached reads in
 * `@/lib/content/queries` are what keep this cheap, and the Payload hooks in
 * `@/lib/hooks/revalidate` invalidate them on edit.
 */
export const dynamic = 'force-dynamic'

export const generateMetadata = async (): Promise<Metadata> => {
  const settings = await getSiteSettings()

  return {
    description: settings.seo?.metaDescription ?? settings.tagline ?? undefined,
    title: settings.seo?.metaTitle || settings.siteName,
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings()

  return (
    <html className={fontVariables} lang="en">
      <body>
        <header>
          <h1>{settings.siteName}</h1>
          {settings.tagline ? <p>{settings.tagline}</p> : null}
          <nav>
            {(settings.nav ?? []).map((link) => (
              <a href={link.href} key={link.id ?? link.href}>
                {link.label}
              </a>
            ))}
            {' | '}
            <Link href="/admin">Admin</Link>
          </nav>
        </header>
        <hr />
        <main>{children}</main>
        <hr />
        <footer>
          <ul>
            {(settings.socials ?? []).map((social) => (
              <li key={social.id ?? social.url}>
                <a href={social.url} rel="noreferrer" target="_blank">
                  {social.platform}
                </a>
              </li>
            ))}
          </ul>
          <p>
            &copy; {new Date().getFullYear()} {settings.siteName}
            {settings.footerText ? ` — ${settings.footerText}` : null}
          </p>
        </footer>
      </body>
    </html>
  )
}
