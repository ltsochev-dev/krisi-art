'use server'

/**
 * Unlocking a password-protected commission.
 *
 * A server action rather than one more Payload endpoint precisely because of the
 * last step: it has to set a cookie, and `cookies()` from `next/headers` is only
 * available inside a server function or a route handler. Everything else about
 * the commission surface is a Payload collection endpoint (see
 * `./endpoints/index.ts`); this one is the exception, and that is why.
 *
 * Two rules shape the whole file:
 *
 * 1. **It never throws for a wrong password.** A rejected attempt is an ordinary
 *    outcome of a form, so it comes back as state the gate renders.
 * 2. **Every failure returns the same sentence.** A missing commission, a
 *    disabled one, an expired one, one with no password set and a wrong password
 *    are indistinguishable to the caller. Otherwise this action would be an
 *    oracle for whether a UUID exists — which is the one secret the whole
 *    feature rests on, since possession of the link is the authorisation.
 */
import { cookies as getCookies, headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import type { CommissionUnlockState } from './unlock-state'

import { evaluateCommissionGate, findCommissionRecordByUuid } from '@/lib/content/commissions'
import { checkRateLimit } from '@/lib/rate-limit'
import { getSiteUrl } from '@/lib/seo/metadata'
import config from '@/payload.config'

import { logCommissionAccess } from './access-log'
import {
  CommissionSecretError,
  signUnlockToken,
  UNLOCK_TOKEN_MAX_AGE_SECONDS,
  unlockCookieName,
  unlockCookiePath,
  verifyPassword,
} from './password'
import { getClientIp } from './request'

/**
 * Ten attempts per IP per fifteen minutes.
 *
 * These are human-chosen passwords — the artist tells a client "it's your
 * surname" — so an unthrottled form is genuinely brute-forcible in a way the
 * UUID is not, and scrypt's cost only makes each *offline* guess expensive, not
 * each request. Ten is the headroom a client needs to fat-finger a password on a
 * phone keyboard a few times and then get it right; it is nowhere near enough to
 * work through a word list.
 */
const RATE_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 }

/** The one thing a failed attempt ever says, whatever actually went wrong. */
const GENERIC_FAILURE = 'That password is not right. Please check the message it came with.'

const MISSING_PASSWORD = 'Please enter the password.'

const UNAVAILABLE = 'Something went wrong unlocking this page. Please try again shortly.'

const field = (formData: FormData, name: string): string => {
  const value = formData.get(name)

  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Whether the unlock cookie may carry the `secure` attribute.
 *
 * Same judgement as `isSecure` in `@/lib/auth/cognito/state`, which reads the
 * scheme off the configured origin — with the proxy's own `x-forwarded-proto`
 * preferred when it is present, since that is the scheme the browser actually
 * used. It matters in the unhelpful direction: a `secure` cookie sent over plain
 * `http` is silently dropped by the browser, so getting this wrong on
 * `localhost` would leave the gate asking for the password forever with no error
 * anywhere to explain it.
 */
const isSecureRequest = (requestHeaders: Headers): boolean => {
  const proto = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim()

  if (proto) {
    return proto.toLowerCase() === 'https'
  }

  return getSiteUrl()?.protocol === 'https:'
}

export const unlockCommission = async (
  _prevState: CommissionUnlockState,
  formData: FormData,
): Promise<CommissionUnlockState> => {
  const password = field(formData, 'password')
  const uuid = field(formData, 'uuid')

  if (!password) {
    return { message: MISSING_PASSWORD, status: 'error' }
  }

  const requestHeaders = await getHeaders()

  // Before the database read, so a script hammering the form is stopped without
  // being given a query per attempt.
  const rateLimit = checkRateLimit({
    key: `commission-unlock:${getClientIp(requestHeaders)}`,
    ...RATE_LIMIT,
  })

  if (!rateLimit.allowed) {
    return {
      message: `Too many attempts from this connection. Please try again in ${Math.ceil(
        rateLimit.retryAfter / 60,
      )} minute(s).`,
      status: 'error',
    }
  }

  const payload = await getPayload({ config: await config })
  const commission = uuid ? await findCommissionRecordByUuid({ payload, uuid }) : null

  if (!commission) {
    return { message: GENERIC_FAILURE, status: 'error' }
  }

  const gate = evaluateCommissionGate(commission)

  if (!gate.ok) {
    // Logged as a refusal with its reason, because there *is* a commission to
    // attach the row to and the artist will want to see that someone tried a
    // link after it lapsed. The caller still only gets `GENERIC_FAILURE`.
    await logCommissionAccess({
      commissionId: commission.id,
      event: 'denied',
      headers: requestHeaders,
      payload,
      reason: gate.reason,
    })

    return { message: GENERIC_FAILURE, status: 'error' }
  }

  // No password set means there is nothing to unlock and the page would not have
  // rendered the gate — so this is either a stale form or a probe, and it gets
  // the same answer as a wrong password rather than a helpful "no password
  // needed".
  if (!commission.passwordHash || !(await verifyPassword(password, commission.passwordHash))) {
    await logCommissionAccess({
      commissionId: commission.id,
      event: 'unlock-failed',
      headers: requestHeaders,
      payload,
    })

    return { message: GENERIC_FAILURE, status: 'error' }
  }

  try {
    const token = await signUnlockToken(uuid)
    const cookieStore = await getCookies()

    /**
     * Scoped to this one commission's path, so unlocking one link never unlocks
     * another and the token is not sent to any other route on the site.
     * `httpOnly` because no client code has any reason to read it, and
     * `sameSite: 'lax'` so it survives the client following the link out of a
     * mail client or a chat app.
     */
    cookieStore.set(unlockCookieName(uuid), token, {
      httpOnly: true,
      maxAge: UNLOCK_TOKEN_MAX_AGE_SECONDS,
      path: unlockCookiePath(uuid),
      sameSite: 'lax',
      secure: isSecureRequest(requestHeaders),
    })
  } catch (error) {
    // Only reachable with `PAYLOAD_SECRET` unset, which is a deployment fault
    // rather than anything the client did — so it is logged loudly and reported
    // as a failure rather than swallowed into a wrong-password message.
    payload.logger.error(
      { commissionId: commission.id, err: error },
      error instanceof CommissionSecretError
        ? 'Cannot sign a commission unlock token.'
        : 'Failed to set the commission unlock cookie.',
    )

    return { message: UNAVAILABLE, status: 'error' }
  }

  await logCommissionAccess({
    commissionId: commission.id,
    event: 'unlock-success',
    headers: requestHeaders,
    payload,
  })

  return { message: null, status: 'success' }
}
