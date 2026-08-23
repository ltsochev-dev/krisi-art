import { jwtVerify, SignJWT } from 'jose'
import { generateCookie } from 'payload/shared'

import type { CognitoConfig } from './config'

import { CognitoAuthError } from './oidc'

export const OAUTH_STATE_COOKIE = 'cognito-oauth-state'

/** Scoped to the callback route so it is never sent anywhere else. */
const COOKIE_PATH = '/api/auth/cognito'

/** The user has this long to finish authenticating at the Hosted UI. */
const STATE_TTL_SECONDS = 600

export type OAuthState = {
  codeVerifier: string
  nonce: string
  /** Admin path to land on once the handshake completes. */
  redirect: string
  state: string
}

const getSecret = (): Uint8Array => {
  const secret = process.env.PAYLOAD_SECRET

  if (!secret) {
    throw new CognitoAuthError('PAYLOAD_SECRET must be set to sign the OAuth state cookie.')
  }

  return new TextEncoder().encode(secret)
}

const isSecure = (config: CognitoConfig): boolean => config.redirectUri.startsWith('https://')

/**
 * The PKCE verifier and nonce must survive a full round trip to Cognito, so they
 * live in a signed, short-lived, httpOnly cookie. SameSite=Lax is required — the
 * cookie has to be sent on the top-level GET navigation back from the Hosted UI.
 */
export const sealOAuthState = async (state: OAuthState): Promise<string> =>
  await new SignJWT({ ...state })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(getSecret())

export const unsealOAuthState = async (value: string): Promise<OAuthState> => {
  try {
    const { payload } = await jwtVerify(value, getSecret())
    const { codeVerifier, nonce, redirect, state } = payload as Record<string, unknown>

    if (
      typeof codeVerifier !== 'string' ||
      typeof nonce !== 'string' ||
      typeof redirect !== 'string' ||
      typeof state !== 'string'
    ) {
      throw new CognitoAuthError('OAuth state cookie is malformed.')
    }

    return { codeVerifier, nonce, redirect, state }
  } catch (error) {
    if (error instanceof CognitoAuthError) {
      throw error
    }

    throw new CognitoAuthError('OAuth state cookie is missing, expired, or was tampered with.')
  }
}

export const buildStateCookie = ({
  config,
  value,
}: {
  config: CognitoConfig
  value: string
}): string =>
  generateCookie<string>({
    name: OAUTH_STATE_COOKIE,
    expires: new Date(Date.now() + STATE_TTL_SECONDS * 1000),
    httpOnly: true,
    maxAge: STATE_TTL_SECONDS,
    path: COOKIE_PATH,
    returnCookieAsObject: false,
    sameSite: 'Lax',
    secure: isSecure(config),
    value,
  })

export const buildExpiredStateCookie = (config: CognitoConfig): string =>
  generateCookie<string>({
    name: OAUTH_STATE_COOKIE,
    expires: new Date(0),
    httpOnly: true,
    path: COOKIE_PATH,
    returnCookieAsObject: false,
    sameSite: 'Lax',
    secure: isSecure(config),
    value: '',
  })
