import type { Page } from '@playwright/test'
import type { User } from '@/payload-types'

import { expect } from '@playwright/test'
import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import { createSessionCookie } from '../../src/lib/auth/cognito/session.js'

export interface LoginOptions {
  page: Page
  serverURL?: string
  user: User
}

/**
 * Signs into the admin panel.
 *
 * There is no login form to drive — the only way in is an OIDC round trip to the
 * Cognito Hosted UI, which is not reachable from a test. Instead we mint the very
 * same Payload session cookie the Cognito callback route issues once it has
 * verified an ID token, and inject it into the browser context.
 */
export async function login({
  page,
  serverURL = 'http://localhost:3000',
  user,
}: LoginOptions): Promise<void> {
  const payload = await getPayload({ config })
  const cookie = await createSessionCookie({ payload, user: user as never })

  // "payload-token=<jwt>; Expires=...; Path=/; HttpOnly..." -> just the JWT
  const value = cookie.split(';')[0].slice(`${payload.config.cookiePrefix}-token=`.length)

  await page.context().addCookies([
    {
      name: `${payload.config.cookiePrefix}-token`,
      httpOnly: true,
      path: '/',
      sameSite: 'Lax',
      url: serverURL,
      value,
    },
  ])

  await page.goto(`${serverURL}/admin`)
  await page.waitForURL(`${serverURL}/admin`)

  await expect(page.locator('span[title="Dashboard"]')).toBeVisible()
}
