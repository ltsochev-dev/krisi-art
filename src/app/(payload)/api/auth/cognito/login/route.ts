import { getSafeRedirect } from 'payload/shared'

import { getCognitoConfig } from '@/lib/auth/cognito/config'
import { buildAuthorizeUrl, createPkcePair, randomUrlSafeString } from '@/lib/auth/cognito/oidc'
import { redirectToPath } from '@/lib/auth/cognito/redirect'
import { buildStateCookie, sealOAuthState } from '@/lib/auth/cognito/state'

export const dynamic = 'force-dynamic'

/**
 * Entry point for the admin sign-in flow: starts an OIDC authorization code
 * exchange (with PKCE) against the Cognito Hosted UI.
 */
export const GET = async (request: Request): Promise<Response> => {
  const { searchParams } = new URL(request.url)

  let config

  try {
    config = getCognitoConfig()
  } catch (error) {
    console.error('[cognito] refusing to start login:', error)
    return redirectToPath('/admin/login?cognitoError=config')
  }

  const redirect = getSafeRedirect({
    fallbackTo: '/admin',
    redirectTo: searchParams.get('redirect') ?? '',
  })

  const { codeChallenge, codeVerifier } = createPkcePair()
  const state = randomUrlSafeString(16)
  const nonce = randomUrlSafeString(16)

  const stateCookie = buildStateCookie({
    config,
    value: await sealOAuthState({ codeVerifier, nonce, redirect, state }),
  })

  return new Response(null, {
    headers: {
      'Cache-Control': 'no-store',
      Location: buildAuthorizeUrl({ codeChallenge, config, nonce, state }),
      'Set-Cookie': stateCookie,
    },
    status: 302,
  })
}
