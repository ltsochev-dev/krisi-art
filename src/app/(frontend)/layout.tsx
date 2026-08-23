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
    <html lang="en">
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
