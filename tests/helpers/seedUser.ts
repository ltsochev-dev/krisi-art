import type { User } from '@/payload-types'

import { getPayload } from 'payload'

import config from '../../src/payload.config.js'

/**
 * There are no local passwords any more — Cognito is the only identity provider —
 * so the seeded user is just the local mirror a real Cognito login would create.
 */
export const testUser = {
  cognitoSub: 'e2e-test-cognito-sub',
  email: 'dev@payloadcms.com',
  name: 'E2E Test User',
  roles: ['admin' as const],
}

/**
 * Seeds the admin user that e2e tests sign in as, returning the created doc so
 * `login()` can mint a session for it.
 *
 * `overrideAccess` is required: the users collection denies `create` outright so
 * that accounts can only ever be provisioned from verified Cognito claims.
 */
export async function seedTestUser(): Promise<User> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    overrideAccess: true,
    where: { email: { equals: testUser.email } },
  })

  return await payload.create({
    collection: 'users',
    data: testUser,
    overrideAccess: true,
  })
}

export async function cleanupTestUser(): Promise<void> {
  const payload = await getPayload({ config })

  await payload.delete({
    collection: 'users',
    overrideAccess: true,
    where: { email: { equals: testUser.email } },
  })
}
