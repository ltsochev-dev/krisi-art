/**
 * Tailwind v4 ships its whole pipeline as a single PostCSS plugin — no
 * `tailwind.config.js`, no `autoprefixer` (it handles vendor prefixing itself).
 *
 * This config is project-wide, but only stylesheets that actually contain
 * Tailwind's at-rules are transformed: the Payload admin's `@payloadcms/next/css`
 * and `custom.scss` pass through untouched.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
