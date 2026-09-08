/**
 * What the access log records about a request.
 *
 * All of it is forensic colour rather than access control. The gate is the UUID
 * (and optionally a password); nothing below is trusted for a decision, and it
 * should not start being trusted for one.
 */

/**
 * Best guess at who is calling.
 *
 * `x-forwarded-for` is only as trustworthy as the reverse proxy in front of the
 * container: a caller reaching the app directly can put whatever it likes in
 * that header, so this is a label on a log row and not an identity. It is used
 * for rate-limit keys too, which is the same speed-bump-not-a-lock bargain
 * `@/lib/rate-limit` already documents.
 *
 * The left-most entry is the original client when the chain is trusted, which
 * matches how `submitContactForm` reads it.
 */
export const getClientIp = (headers: Headers): string => {
  const forwarded = headers.get('x-forwarded-for')

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()

    if (first) {
      return first
    }
  }

  return headers.get('x-real-ip')?.trim() || 'unknown'
}

export type ParsedUserAgent = {
  browser: string
  deviceType: string
  os: string
}

/**
 * A dozen browser and OS families, by regex.
 *
 * Deliberately not a dependency: the access log exists so the artist can see
 * "Chrome on Windows, twice yesterday", and a UA-parsing library with a
 * device-capability database is a lot of supply chain for that sentence. The
 * table is ordered — Edge and Opera both claim to be Chrome, so they have to be
 * tested first, and the same goes for iOS claiming to be Mac.
 */
const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/CriOS\//, 'Chrome'],
  [/FxiOS\//, 'Firefox'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
  [/curl\//, 'curl'],
  [/(?:bot|crawler|spider|slurp)/i, 'Bot'],
]

const OPERATING_SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows NT/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

const UNKNOWN = 'Unknown'

const firstMatch = (table: [RegExp, string][], value: string): string =>
  table.find(([pattern]) => pattern.test(value))?.[1] ?? UNKNOWN

/**
 * `deviceType` is the coarse three-way split a phone/tablet/desktop column
 * needs, taken from the same string. A tablet has to be recognised before a
 * phone, because Android tablets say `Android` without saying `Mobile`.
 */
const deviceTypeOf = (value: string): string => {
  if (/iPad|Tablet|Android(?!.*Mobile)/.test(value)) {
    return 'tablet'
  }

  if (/Mobi|iPhone|iPod|Android/.test(value)) {
    return 'mobile'
  }

  return 'desktop'
}

export const parseUserAgent = (userAgent: null | string | undefined): ParsedUserAgent => {
  const value = userAgent?.trim()

  if (!value) {
    return { browser: UNKNOWN, deviceType: UNKNOWN, os: UNKNOWN }
  }

  return {
    browser: firstMatch(BROWSERS, value),
    deviceType: deviceTypeOf(value),
    os: firstMatch(OPERATING_SYSTEMS, value),
  }
}

/**
 * RFC 5987 `Content-Disposition` value.
 *
 * Both forms are emitted: a stripped ASCII `filename` for anything that cannot
 * read the extended parameter, and `filename*` with the real name percent-
 * encoded as UTF-8 — which is what makes a Cyrillic filename arrive intact
 * rather than as a row of question marks. This string is *signed* into the
 * presigned URL (see `getPresignedDownloadUrl`), so the client cannot rewrite
 * it.
 */
export const contentDispositionAttachment = (filename: string): string => {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/** One named cookie out of a raw `Cookie` header, or `null`. */
export const readCookie = (cookieHeader: null | string, name: string): null | string => {
  if (!cookieHeader) {
    return null
  }

  for (const part of cookieHeader.split(';')) {
    const index = part.indexOf('=')

    if (index === -1) {
      continue
    }

    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim())
    }
  }

  return null
}
