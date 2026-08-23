import type { JWTPayload } from 'jose'

import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'

import type { CognitoConfig } from './config'

/** Claims we rely on from the Cognito ID token. */
export type CognitoIdTokenClaims = {
  'cognito:groups'?: string[]
  'cognito:username'?: string
  email?: string
  email_verified?: boolean
  name?: string
  nonce?: string
  sub: string
  token_use: string
} & JWTPayload

export type TokenSet = {
  access_token: string
  expires_in: number
  id_token: string
  refresh_token?: string
  token_type: string
}

export class CognitoAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CognitoAuthError'
  }
}

/** Cognito itself rejected the code exchange, as opposed to the call failing. */
export class CognitoTokenExchangeError extends CognitoAuthError {
  constructor(message: string) {
    super(message)
    this.name = 'CognitoTokenExchangeError'
  }
}

const base64url = (input: Buffer): string => input.toString('base64url')

export const randomUrlSafeString = (bytes = 32): string => base64url(randomBytes(bytes))

/** RFC 7636 S256 challenge. */
export const createPkcePair = (): { codeChallenge: string; codeVerifier: string } => {
  const codeVerifier = randomUrlSafeString(32)
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())

  return { codeChallenge, codeVerifier }
}

export const buildAuthorizeUrl = ({
  codeChallenge,
  config,
  nonce,
  state,
}: {
  codeChallenge: string
  config: CognitoConfig
  nonce: string
  state: string
}): string => {
  const url = new URL(config.authorizeEndpoint)

  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scopes.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')

  return url.toString()
}

export const buildLogoutUrl = (config: CognitoConfig): string => {
  const url = new URL(config.logoutEndpoint)

  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('logout_uri', config.logoutRedirectUri)

  return url.toString()
}

export const exchangeCodeForTokens = async ({
  code,
  codeVerifier,
  config,
}: {
  code: string
  codeVerifier: string
  config: CognitoConfig
}): Promise<TokenSet> => {
  const body = new URLSearchParams({
    client_id: config.clientId,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
  })

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  // Confidential clients authenticate to the token endpoint with HTTP Basic;
  // public clients rely on PKCE alone.
  if (config.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(
      `${config.clientId}:${config.clientSecret}`,
    ).toString('base64')}`
  }

  const response = await fetch(`${config.domain}/oauth2/token`, {
    body,
    cache: 'no-store',
    headers,
    method: 'POST',
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new CognitoTokenExchangeError(
      `Cognito token exchange failed (${response.status}): ${detail.slice(0, 500)}`,
    )
  }

  return (await response.json()) as TokenSet
}

/**
 * jose caches the key set and refetches on unknown `kid`, so this stays a
 * module-level singleton keyed by JWKS URI.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

const getJwks = (config: CognitoConfig) => {
  let jwks = jwksCache.get(config.jwksUri)

  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(config.jwksUri))
    jwksCache.set(config.jwksUri, jwks)
  }

  return jwks
}

/**
 * Checks the claims that `jwtVerify` does not: signature, `iss` and `aud` are
 * already enforced there, but token type, replay binding and subject are ours.
 */
export const assertIdTokenClaims = ({
  claims,
  nonce,
}: {
  claims: CognitoIdTokenClaims
  nonce: string
}): CognitoIdTokenClaims => {
  // Guards against an access token being swapped in for an ID token.
  if (claims.token_use !== 'id') {
    throw new CognitoAuthError(`Expected an ID token but got token_use="${claims.token_use}".`)
  }

  // Binds the token to the login attempt that started in this browser.
  if (!nonce || claims.nonce !== nonce) {
    throw new CognitoAuthError('ID token nonce does not match the value sent to Cognito.')
  }

  if (!claims.sub) {
    throw new CognitoAuthError('ID token is missing the "sub" claim.')
  }

  return claims
}

export const verifyIdToken = async ({
  config,
  idToken,
  nonce,
}: {
  config: CognitoConfig
  idToken: string
  nonce: string
}): Promise<CognitoIdTokenClaims> => {
  const { payload } = await jwtVerify(idToken, getJwks(config), {
    audience: config.clientId,
    issuer: config.issuer,
  })

  return assertIdTokenClaims({ claims: payload as CognitoIdTokenClaims, nonce })
}
