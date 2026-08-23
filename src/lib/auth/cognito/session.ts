import type { Payload, TypedUser } from 'payload'

import { createLocalReq, getFieldsToSign, jwtSign } from 'payload'
import {
  addSessionToUser,
  generateExpiredPayloadCookie,
  generatePayloadCookie,
} from 'payload/shared'

import type { Role } from '../roles'
import type { CognitoConfig } from './config'
import type { CognitoIdTokenClaims } from './oidc'

import { CognitoAuthError } from './oidc'

/** Slug of whichever collection backs the admin panel, correctly typed. */
type UserSlug = TypedUser['collection']

const getUsersSlug = (payload: Payload): UserSlug => payload.config.admin.user as UserSlug

const getUsersCollection = (payload: Payload) => {
  const slug = getUsersSlug(payload)
  const collection = payload.collections[slug]

  if (!collection) {
    throw new CognitoAuthError(`Admin user collection "${slug}" is not registered.`)
  }

  return collection
}

/**
 * Cognito group membership is the only thing that grants access. A user in no
 * mapped group is rejected outright and no local record is created for them.
 */
export const resolveRoles = ({
  claims,
  config,
}: {
  claims: CognitoIdTokenClaims
  config: CognitoConfig
}): Role[] => {
  const groups = Array.isArray(claims['cognito:groups']) ? claims['cognito:groups'] : []

  return [
    ...new Set(
      groups
        .map((group) => config.roleByGroup[group])
        .filter((role): role is Role => Boolean(role)),
    ),
  ]
}

/**
 * Upserts the local mirror of the Cognito identity. Matches on `cognitoSub`
 * first; falls back to email so that accounts predating this integration get
 * adopted rather than duplicated (email is unique on the collection).
 */
export const provisionUser = async ({
  claims,
  payload,
  roles,
}: {
  claims: CognitoIdTokenClaims
  payload: Payload
  roles: Role[]
}): Promise<TypedUser> => {
  const collection = getUsersSlug(payload)
  const email = claims.email?.trim().toLowerCase()

  if (!email) {
    throw new CognitoAuthError(
      'Cognito did not return an email claim. Add the "email" scope to the app client and ' +
        'make sure the attribute is readable.',
    )
  }

  const name = claims.name?.trim() || claims['cognito:username']?.trim() || null

  const existing = (
    await payload.find({
      collection,
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        or: [{ cognitoSub: { equals: claims.sub } }, { email: { equals: email } }],
      },
    })
  ).docs[0]

  const data = { cognitoSub: claims.sub, email, name, roles }

  // An existing record matched by email but carrying a different sub means the
  // Cognito identity was recreated — re-point the record at the new subject.
  const user = existing
    ? await payload.update({
        id: existing.id,
        collection,
        data,
        depth: 0,
        overrideAccess: true,
      })
    : await payload.create({ collection, data, depth: 0, overrideAccess: true })

  return { ...user, collection } as TypedUser
}

/**
 * Mirrors what Payload's own login operation does after a successful password
 * check: register a server-side session, then sign it into the standard Payload
 * cookie. Keeping the session row means logout and revocation still work.
 */
export const createSessionCookie = async ({
  payload,
  user,
}: {
  payload: Payload
  user: TypedUser
}): Promise<string> => {
  const collectionConfig = getUsersCollection(payload).config
  const req = await createLocalReq({}, payload)

  const { sid } = await addSessionToUser({ collectionConfig, payload, req, user })

  const fieldsToSign = getFieldsToSign({
    collectionConfig,
    email: user.email,
    sid,
    user,
  })

  const { token } = await jwtSign({
    fieldsToSign,
    secret: payload.secret,
    tokenExpiration: collectionConfig.auth.tokenExpiration,
  })

  return generatePayloadCookie({
    collectionAuthConfig: collectionConfig.auth,
    cookiePrefix: payload.config.cookiePrefix,
    token,
  })
}

export const buildExpiredSessionCookie = (payload: Payload): string =>
  generateExpiredPayloadCookie({
    collectionAuthConfig: getUsersCollection(payload).config.auth,
    cookiePrefix: payload.config.cookiePrefix,
  })

/**
 * Drops the caller's server-side session (and any that have already lapsed) so
 * the signed-out JWT stops authenticating even before it expires.
 */
export const revokeCurrentSession = async ({
  payload,
  user,
}: {
  payload: Payload
  user: TypedUser
}): Promise<void> => {
  const collection = getUsersSlug(payload)
  const sid = (user as { _sid?: string })._sid

  if (!getUsersCollection(payload).config.auth.useSessions || !sid) {
    return
  }

  const current = await payload.findByID({
    id: user.id,
    collection,
    depth: 0,
    overrideAccess: true,
  })

  const now = Date.now()
  const sessions = (current.sessions ?? []).filter(
    (session) => session.id !== sid && new Date(session.expiresAt).getTime() > now,
  )

  await payload.update({
    id: user.id,
    collection,
    data: { sessions },
    depth: 0,
    overrideAccess: true,
  })
}
