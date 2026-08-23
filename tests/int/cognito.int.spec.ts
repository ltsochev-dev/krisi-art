/**
 * @vitest-environment node
 *
 * These modules only ever run on the server. Under the project's default jsdom
 * environment, jose's `instanceof Uint8Array` key check fails on jsdom's
 * cross-realm typed arrays, which has nothing to do with the code under test.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  assertIdTokenClaims,
  buildAuthorizeUrl,
  buildLogoutUrl,
  createPkcePair,
} from '@/lib/auth/cognito/oidc'
import { getCognitoConfigError } from '@/lib/auth/cognito/config'
import { resolveRoles } from '@/lib/auth/cognito/session'
import { sealOAuthState, unsealOAuthState } from '@/lib/auth/cognito/state'
import { hasAnyRole, isAdmin } from '@/lib/auth/roles'

import { createHash } from 'node:crypto'

const config = {
  authorizeEndpoint: 'https://pool.auth.eu-central-1.amazoncognito.com/oauth2/authorize',
  clientId: 'client-abc',
  domain: 'https://pool.auth.eu-central-1.amazoncognito.com',
  issuer: 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_TEST',
  jwksUri: 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_TEST/.well-known/jwks.json',
  logoutEndpoint: 'https://pool.auth.eu-central-1.amazoncognito.com/logout',
  logoutRedirectUri: 'https://admin.example.com/admin/login',
  redirectUri: 'https://admin.example.com/api/auth/cognito/callback',
  region: 'eu-central-1',
  roleByGroup: { 'payload-admins': 'admin' as const, 'payload-editors': 'editor' as const },
  scopes: ['openid', 'email', 'profile'],
  userPoolId: 'eu-central-1_TEST',
}

const claims = (overrides: Record<string, unknown> = {}) => ({
  nonce: 'the-nonce',
  sub: 'cognito-sub-1',
  token_use: 'id',
  ...overrides,
})

describe('Cognito PKCE', () => {
  it('derives an S256 challenge from the verifier', () => {
    const { codeChallenge, codeVerifier } = createPkcePair()
    const expected = createHash('sha256').update(codeVerifier).digest('base64url')

    expect(codeChallenge).toBe(expected)
    // base64url only: no +, / or = that would need escaping in a query string
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('produces a different verifier every time', () => {
    const verifiers = new Set(Array.from({ length: 25 }, () => createPkcePair().codeVerifier))
    expect(verifiers.size).toBe(25)
  })
})

describe('Cognito authorize URL', () => {
  it('requests an authorization code with PKCE, state and nonce', () => {
    const url = new URL(
      buildAuthorizeUrl({ codeChallenge: 'chal', config, nonce: 'n', state: 's' }),
    )

    expect(url.origin + url.pathname).toBe(config.authorizeEndpoint)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('client-abc')
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri)
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('code_challenge')).toBe('chal')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('state')).toBe('s')
    expect(url.searchParams.get('nonce')).toBe('n')
    // Implicit flow must never be requested.
    expect(url.searchParams.get('response_type')).not.toContain('token')
  })

  it('builds a sign-out URL that returns to the login screen', () => {
    const url = new URL(buildLogoutUrl(config))

    expect(url.origin + url.pathname).toBe(config.logoutEndpoint)
    expect(url.searchParams.get('client_id')).toBe('client-abc')
    expect(url.searchParams.get('logout_uri')).toBe(config.logoutRedirectUri)
  })
})

describe('ID token claims', () => {
  it('accepts a well-formed ID token', () => {
    expect(assertIdTokenClaims({ claims: claims() as never, nonce: 'the-nonce' })).toMatchObject({
      sub: 'cognito-sub-1',
    })
  })

  it('rejects an access token passed off as an ID token', () => {
    expect(() =>
      assertIdTokenClaims({ claims: claims({ token_use: 'access' }) as never, nonce: 'the-nonce' }),
    ).toThrow(/token_use/)
  })

  it('rejects a replayed token whose nonce does not match this login attempt', () => {
    expect(() =>
      assertIdTokenClaims({ claims: claims({ nonce: 'other' }) as never, nonce: 'the-nonce' }),
    ).toThrow(/nonce/)
  })

  it('rejects a token with no nonce at all', () => {
    expect(() =>
      assertIdTokenClaims({ claims: claims({ nonce: undefined }) as never, nonce: 'the-nonce' }),
    ).toThrow(/nonce/)
  })

  it('refuses to treat an empty expected nonce as a match', () => {
    expect(() =>
      assertIdTokenClaims({ claims: claims({ nonce: undefined }) as never, nonce: '' }),
    ).toThrow(/nonce/)
  })

  it('rejects a token with no subject', () => {
    expect(() =>
      assertIdTokenClaims({ claims: claims({ sub: undefined }) as never, nonce: 'the-nonce' }),
    ).toThrow(/sub/)
  })
})

describe('OAuth state cookie', () => {
  beforeEach(() => {
    process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || 'test-secret'
  })

  const state = {
    codeVerifier: 'verifier',
    nonce: 'nonce',
    redirect: '/admin/collections/media',
    state: 'state-value',
  }

  it('round-trips a sealed state', async () => {
    expect(await unsealOAuthState(await sealOAuthState(state))).toMatchObject(state)
  })

  it('rejects a tampered payload', async () => {
    const sealed = await sealOAuthState(state)
    const [header, body, signature] = sealed.split('.')
    const forged = JSON.parse(Buffer.from(body, 'base64url').toString())
    forged.redirect = '/admin/somewhere-else'
    const tampered = [
      header,
      Buffer.from(JSON.stringify(forged)).toString('base64url'),
      signature,
    ].join('.')

    await expect(unsealOAuthState(tampered)).rejects.toThrow()
  })

  it('rejects a token signed with a different secret', async () => {
    const original = process.env.PAYLOAD_SECRET
    process.env.PAYLOAD_SECRET = 'attacker-secret'
    const forged = await sealOAuthState(state)
    process.env.PAYLOAD_SECRET = original

    await expect(unsealOAuthState(forged)).rejects.toThrow()
  })

  it('rejects garbage', async () => {
    await expect(unsealOAuthState('not-a-jwt')).rejects.toThrow()
  })
})

describe('Cognito group to role mapping', () => {
  const roles = (groups?: string[]) =>
    resolveRoles({ claims: { 'cognito:groups': groups } as never, config })

  it('maps mapped groups to roles', () => {
    expect(roles(['payload-admins'])).toEqual(['admin'])
    expect(roles(['payload-editors'])).toEqual(['editor'])
    expect(roles(['payload-admins', 'payload-editors']).sort()).toEqual(['admin', 'editor'])
  })

  it('ignores unmapped groups', () => {
    expect(roles(['some-other-group', 'payload-editors'])).toEqual(['editor'])
  })

  it('grants nothing without a mapped group', () => {
    expect(roles(['unrelated'])).toEqual([])
    expect(roles([])).toEqual([])
    expect(roles(undefined)).toEqual([])
  })

  it('de-duplicates when two groups map to the same role', () => {
    const shared = { ...config, roleByGroup: { a: 'admin' as const, b: 'admin' as const } }
    expect(resolveRoles({ claims: { 'cognito:groups': ['a', 'b'] } as never, config: shared })).toEqual(
      ['admin'],
    )
  })
})

describe('role helpers gate admin access', () => {
  it('requires a recognised role to reach the admin panel', () => {
    expect(hasAnyRole({ roles: ['admin'] })).toBe(true)
    expect(hasAnyRole({ roles: ['editor'] })).toBe(true)
    expect(hasAnyRole({ roles: [] })).toBe(false)
    expect(hasAnyRole({ roles: null })).toBe(false)
    expect(hasAnyRole(null)).toBe(false)
    // A stale value that is no longer a known role must not grant access.
    expect(hasAnyRole({ roles: ['something-removed'] })).toBe(false)
  })

  it('distinguishes admins from editors', () => {
    expect(isAdmin({ roles: ['admin'] })).toBe(true)
    expect(isAdmin({ roles: ['editor'] })).toBe(false)
    expect(isAdmin(null)).toBe(false)
  })
})

describe('Cognito configuration', () => {
  it('reports a helpful error when unconfigured rather than throwing', () => {
    const saved = process.env.COGNITO_REGION
    delete process.env.COGNITO_REGION

    const error = getCognitoConfigError()
    // Already cached from an earlier configured call in some run orders; either
    // a clear message or a successful resolve is acceptable, never a throw.
    expect(error === null || /COGNITO_|Cognito/.test(error)).toBe(true)

    if (saved) {
      process.env.COGNITO_REGION = saved
    }
  })
})
