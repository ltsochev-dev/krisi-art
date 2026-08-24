/**
 * Frontend shell.
 *
 * Deliberately unstyled for now — this is a data preview, not a design. The
 * point of interest is that the chrome (site name, nav, socials, footer) comes
 * from the `site-settings` global through the cached read helper, so every
 * route under `(frontend)` gets it without fetching anything itself.
 */
import type { Metadata } from 'next'

import React from 'react'

import { getSiteSettings } from '@/lib/content/queries'
import { fontVariables } from '@/lib/fonts'
import config from '@/payload.config'

// Tailwind, loaded here only. The Payload admin has its own root layout and
// stylesheet, so the reset in here never reaches it.
import './globals.css'
import { getPayload } from 'payload'
import { headers } from 'next/headers'
import Navbar from '@/components/Navbar'
import logo from '@/assets/logo-light.png'
import Footer from '@/components/Footer'

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
  const payload = await getPayload({ config })
  const headersList = await headers()
  const settings = await getSiteSettings()

  const { user } = await payload.auth({ headers: headersList })

  const isAdminVisible = user && user.roles?.includes('admin')

  const links = [
    ...(settings.nav ?? []),
    ...(isAdminVisible ? [{ id: 'admin', href: '/admin', label: 'Admin' }] : []),
  ]

  return (
    <html className={fontVariables} lang="en">
      <body>
        <header>
          {settings.tagline ? <p>{settings.tagline}</p> : null}
          <Navbar siteName={settings.siteName} logo={logo} links={links} />
        </header>
        <main>{children}</main>
        <Footer
          siteName={settings.siteName}
          footerText={settings.footerText}
          privacyUrl="/privacy"
          termsUrl="/terms"
        />
      </body>
    </html>
  )
}
