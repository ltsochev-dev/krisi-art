import { getPayload } from 'payload'

import config from '@payload-config'

import { getCognitoConfig } from '@/lib/auth/cognito/config'
import { buildLogoutUrl } from '@/lib/auth/cognito/oidc'
import { buildExpiredSessionCookie, revokeCurrentSession } from '@/lib/auth/cognito/session'

export const dynamic = 'force-dynamic'

/**
 * Signs the user out of Payload *and* Cognito. Clearing only the local cookie
 * would leave the Hosted UI session intact, so the next sign-in would silently
 * log the same person straight back in.
 */
export const GET = async (request: Request): Promise<Response> => {
  const headers = new Headers({ 'Cache-Control': 'no-store' })
  const payload = await getPayload({ config })

  try {
    const { user } = await payload.auth({ headers: request.headers })

    if (user) {
      await revokeCurrentSession({ payload, user })
    }
  } catch (error) {
    // A failure here must not strand the user in a half-signed-in state.
    payload.logger.error({ err: error }, '[cognito] failed to revoke the local session')
  }

  headers.append('Set-Cookie', buildExpiredSessionCookie(payload))

  try {
    headers.set('Location', buildLogoutUrl(getCognitoConfig()))
  } catch {
    headers.set('Location', new URL('/admin/login', request.url).toString())
  }

  return new Response(null, { headers, status: 302 })
}
