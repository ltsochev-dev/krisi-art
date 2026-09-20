/**
 * The optional per-commission password, and the token that remembers it.
 *
 * Two separate mechanisms, and the split is the point:
 *
 * - **The password** is hashed with scrypt and never leaves the row. scrypt
 *   rather than an HMAC because these are human-chosen and low-entropy — the
 *   artist tells a client "the password is their surname" — so the only defence
 *   against someone who has the database file is that guessing is expensive.
 * - **The unlock token** is a short-lived signed JWT in a cookie, so a client
 *   who has typed the password once is not asked again on every download. It
 *   carries the commission's UUID and nothing else, and is signed with
 *   `PAYLOAD_SECRET` through `jose`, exactly as the OAuth state cookie in
 *   `@/lib/auth/cognito/state` is.
 *
 * Neither is the primary gate. Possession of the UUID is; the password is a
 * second factor the artist can add per commission.
 */
import type { ScryptOptions } from 'node:crypto'

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'

import { jwtVerify, SignJWT } from 'jose'

import { commissionPath } from './routes'

/**
 * Promisified `scrypt`, by hand rather than through `promisify`.
 *
 * `promisify` resolves to the first of the two overloads and drops the one that
 * takes an options object — which is the only one that can set the cost
 * parameters, so it is the only one worth having.
 */
const scrypt = (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, derivedKey) =>
      error ? reject(error) : resolve(derivedKey),
    )
  })

/**
 * scrypt cost parameters, stored *in* the hash rather than read from here when
 * verifying — so raising them later leaves every existing password working and
 * only new ones get the higher cost.
 */
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64
const SALT_BYTES = 16

/** `scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>` */
const PREFIX = 'scrypt'

export const hashPassword = async (plain: string): Promise<string> => {
  const salt = randomBytes(SALT_BYTES)
  const derived = await scrypt(plain.normalize('NFKC'), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    p: SCRYPT_P,
    r: SCRYPT_R,
  })

  return [
    PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

/**
 * Constant-time comparison against a stored hash.
 *
 * Returns `false` rather than throwing for every kind of malformed input,
 * including a stored value in some other format — a commission whose hash
 * cannot be parsed is one nobody can unlock, which is the safe direction to
 * fail in.
 */
export const verifyPassword = async (plain: string, stored: null | string): Promise<boolean> => {
  if (!plain || !stored) {
    return false
  }

  const parts = stored.split('$')

  if (parts.length !== 6 || parts[0] !== PREFIX) {
    return false
  }

  const [, n, r, p, salt, hash] = parts
  const cost = { N: Number(n), p: Number(p), r: Number(r) }

  if (!Number.isFinite(cost.N) || !Number.isFinite(cost.r) || !Number.isFinite(cost.p)) {
    return false
  }

  const expected = Buffer.from(hash, 'base64')

  try {
    const derived = await scrypt(
      plain.normalize('NFKC'),
      Buffer.from(salt, 'base64'),
      expected.length,
      cost,
    )

    return derived.length === expected.length && timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

/** How long an unlock survives. Long enough for a working day, not forever. */
const UNLOCK_TTL_SECONDS = 12 * 60 * 60

export class CommissionSecretError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommissionSecretError'
  }
}

const getSecret = (): Uint8Array => {
  const secret = process.env.PAYLOAD_SECRET

  if (!secret) {
    throw new CommissionSecretError('PAYLOAD_SECRET must be set to sign commission unlock tokens.')
  }

  return new TextEncoder().encode(secret)
}

/**
 * Cookie name for a commission's unlock token.
 *
 * One cookie per commission, scoped to that commission's path, so unlocking one
 * link never unlocks another. Note that a cookie is scoped to an *origin* too:
 * a client who unlocks on `kristinakostova.art` and is later sent the
 * `kristinakostova.com` link will be asked again. That is correct, and it is why
 * a second `unlock-success` from the same IP in the access log is not a bug.
 */
export const unlockCookieName = (uuid: string): string => `commission_${uuid}`

/**
 * The paths the unlock token is scoped to — **two** of them, and the second one
 * is load-bearing rather than defensive.
 *
 * A cookie is only sent to its own path and below it. The page lives at
 * `/album/<slug>` or `/commission/<uuid>`, but the download endpoint lives at
 * `/api/commissions/<uuid>/download/<fileId>`, which is under neither — so a
 * token scoped only to the page is never sent to the endpoint that has to check
 * it, and every download from a password-protected commission answers 401 no
 * matter how many times the client types the password correctly. The fix is two
 * cookies carrying the same token, one scoped to each surface.
 *
 * `/api` rather than a value read from the Payload config: the client already
 * hardcodes that prefix when it calls the endpoints (see `CommissionFiles`), so
 * a second opinion about it here would only be a way for the two to disagree.
 *
 * Still deliberately narrow. Scoping to `/` would work and would put the token
 * on every request to the portfolio as well, which is exactly what path scoping
 * is for avoiding.
 */
export const unlockCookiePaths = (commission: { slug?: null | string; uuid: string }): string[] => [
  commissionPath(commission) ?? `/commission/${commission.uuid}`,
  `/api/commissions/${encodeURIComponent(commission.uuid)}`,
]

export const signUnlockToken = async (uuid: string): Promise<string> =>
  await new SignJWT({ uuid })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${UNLOCK_TTL_SECONDS}s`)
    .sign(getSecret())

export const UNLOCK_TOKEN_MAX_AGE_SECONDS = UNLOCK_TTL_SECONDS

/**
 * Whether this token unlocks this commission.
 *
 * The UUID is re-checked against the claim rather than trusted from the path:
 * the cookie is path-scoped, but a client can send any cookie it likes to any
 * path, so the token has to say which commission it is for.
 */
export const verifyUnlockToken = async (
  token: null | string | undefined,
  uuid: string,
): Promise<boolean> => {
  if (!token) {
    return false
  }

  try {
    const { payload } = await jwtVerify(token, getSecret())

    return payload.uuid === uuid
  } catch {
    return false
  }
}
