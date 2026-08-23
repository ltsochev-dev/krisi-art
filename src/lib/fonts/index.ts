/**
 * The two Google faces the design uses, self-hosted by `next/font` instead of
 * the `@import url('https://fonts.googleapis.com/css2?...')` the v3 stylesheet
 * had. Next downloads the files at build time and serves them from our own
 * origin, so there is no render-blocking request to `fonts.googleapis.com` and
 * no second hop to `fonts.gstatic.com`.
 *
 * Both are variable fonts, so `weight` is deliberately omitted: that pulls the
 * whole axis in one file, which covers the discrete weights the old URL asked
 * for (Cormorant 400/500/600/700, Inter 300/400/500/600) and costs less than
 * fetching them as separate static instances. `display: 'swap'` — the `&display=swap`
 * in the old URL — is already the default.
 */
import { Cormorant_Garamond, Inter } from 'next/font/google'

export const serif = Cormorant_Garamond({
  // The old URL's `ital,wght@0,...;1,400`: upright plus a real italic file,
  // rather than letting the browser synthesise a slant.
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-serif-family',
})

export const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans-family',
})

/** Both `variable`s, for the `<html>` element in the frontend root layout. */
export const fontVariables = `${serif.variable} ${sans.variable}`
