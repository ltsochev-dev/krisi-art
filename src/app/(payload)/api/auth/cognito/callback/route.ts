import { timingSafeEqual } from 'node:crypto'
import { getPayload } from 'payload'
import { parseCookies } from 'payload/shared'

import config from '@payload-config'

import { getCognitoConfig } from '@/lib/auth/cognito/config'
import { redirectToPath } from '@/lib/auth/cognito/redirect'
import {
  CognitoTokenExchangeError,
  exchangeCodeForTokens,
  verifyIdToken,
} from '@/lib/auth/cognito/oidc'
import { createSessionCookie, provisionUser, resolveRoles } from '@/lib/auth/cognito/session'
import {
  buildExpiredStateCookie,
  OAUTH_STATE_COOKIE,
  unsealOAuthState,
} from '@/lib/auth/cognito/state'

export const dynamic = 'force-dynamic'

/** Short codes surfaced on the login screen; details stay in the server log. */
type FailureCode =
  | 'access_denied'
  | 'config'
  | 'exchange_failed'
  | 'invalid_state'
  | 'provider_error'
  | 'server_error'

const constantTimeEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  return left.length === right.length && timingSafeEqual(left, right)
}

export const GET = async (request: Request): Promise<Response> => {
  const { searchParams } = new URL(request.url)

  let cognito

  try {
    cognito = getCognitoConfig()
  } catch (error) {
    console.error('[cognito] callback received but Cognito is not configured:', error)
    return redirectToPath('/admin/login?cognitoError=config')
  }

  const headers = new Headers({ 'Cache-Control': 'no-store' })

  // The state cookie has served its purpose either way — always clear it.
  headers.append('Set-Cookie', buildExpiredStateCookie(cognito))

  const fail = (code: FailureCode): Response =>
    redirectToPath(`/admin/login?cognitoError=${code}`, headers)

  const providerError = searchParams.get('error')

  if (providerError) {
    console.error(
      `[cognito] provider returned an error: ${providerError} ${
        searchParams.get('error_description') ?? ''
      }`,
    )
    return fail('provider_error')
  }

  const code = searchParams.get('code')
  const returnedState = searchParams.get('state')
  const sealedState = parseCookies(request.headers).get(OAUTH_STATE_COOKIE)

  if (!code || !returnedState || !sealedState) {
    console.error('[cognito] callback is missing the code, state, or state cookie.')
    return fail('invalid_state')
  }

  let oauthState

  // Kept separate so a forged, expired, or mismatched state reports as such
  // rather than being lumped in with downstream failures.
  try {
    oauthState = await unsealOAuthState(sealedState)

    if (!constantTimeEquals(oauthState.state, returnedState)) {
      throw new Error('state parameter does not match the state cookie')
    }
  } catch (error) {
    console.error('[cognito] rejecting callback:', error)
    return fail('invalid_state')
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      codeVerifier: oauthState.codeVerifier,
      config: cognito,
    })

    const claims = await verifyIdToken({
      config: cognito,
      idToken: tokens.id_token,
      nonce: oauthState.nonce,
    })

    const payload = await getPayload({ config })
    const roles = resolveRoles({ claims, config: cognito })

    // No mapped Cognito group means no access, and no local record is created.
    if (roles.length === 0) {
      payload.logger.warn(
        `[cognito] denying ${claims.email ?? claims.sub}: not a member of any mapped group ` +
          `(${Object.keys(cognito.roleByGroup).join(', ')}).`,
      )
      return fail('access_denied')
    }

    const user = await provisionUser({ claims, payload, roles })

    headers.append('Set-Cookie', await createSessionCookie({ payload, user }))

    // `oauthState.redirect` is a `getSafeRedirect` result — a path on this app.
    return redirectToPath(oauthState.redirect, headers)
  } catch (error) {
    console.error('[cognito] sign-in failed:', error)

    // Only a genuine rejection by Cognito is reported as such; a network or
    // configuration failure on our side is not the user's problem to retry.
    return fail(error instanceof CognitoTokenExchangeError ? 'exchange_failed' : 'server_error')
  }
}
