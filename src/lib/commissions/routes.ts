/**
 * Where a commission lives on the public site.
 *
 * A commission has two possible addresses and exactly one *canonical* one:
 *
 * - `/commission/<uuid>` — minted with the document, never changes, always
 *   valid. A link already sent out keeps working forever.
 * - `/album/<slug>` — the vanity address, when the artist has set a slug.
 *   Easier to say out loud and to paste into a group chat, which is the whole
 *   point of it.
 *
 * When a slug is set, the UUID route **redirects** to it rather than rendering
 * the same page at two URLs. That is not tidiness. The unlock cookie is scoped
 * to the page's own path (see `unlockCookiePaths`), so a commission reachable at
 * two live addresses would mean a password typed at one of them not being
 * remembered at the other.
 *
 * Note what a slug is **not**: it is not a secret, and it is not access control.
 * `/album/prague-2026` is guessable by anyone who thinks to guess it — that is
 * the trade for a link that is easy to share. The UUID is the unguessable
 * address. A commission that must stay unfindable should have no slug, or a
 * password as well.
 */

/** Lowercase words joined by single hyphens. No slashes, no dots, no spaces. */
export const COMMISSION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Longest slug accepted. Well short of any path limit — this is about a link
 * someone reads out over a dinner table, not about what a URL can hold.
 */
export const MAX_COMMISSION_SLUG_LENGTH = 64

/**
 * A submitted slug in storable form, or `null` when there is nothing there.
 *
 * `null` rather than `''` matters at the database level: the column carries a
 * unique index, SQLite allows any number of `NULL`s in one, and exactly one
 * empty string. Two commissions saved with the box left empty would therefore
 * collide on the second if this returned `''`.
 */
export const normaliseCommissionSlug = (value: unknown): null | string => {
  if (typeof value !== 'string') {
    return null
  }

  return value.trim().toLowerCase() || null
}

export const isValidCommissionSlug = (value: string): boolean =>
  value.length <= MAX_COMMISSION_SLUG_LENGTH && COMMISSION_SLUG_PATTERN.test(value)

/**
 * The canonical public path of a commission, or `null` when it has neither
 * address — which only happens for a document that has not been created yet, in
 * the admin panel's new-document form.
 *
 * The slug wins when there is one. Everything that builds a link for the artist
 * to send goes through here, so the sidebar link, the redirect target and the
 * unlock cookie's path cannot disagree about which URL is the real one.
 */
export const commissionPath = ({
  slug,
  uuid,
}: {
  slug?: null | string
  uuid?: null | string
}): null | string => {
  const vanity = normaliseCommissionSlug(slug)

  if (vanity) {
    return `/album/${encodeURIComponent(vanity)}`
  }

  return uuid ? `/commission/${encodeURIComponent(uuid)}` : null
}
