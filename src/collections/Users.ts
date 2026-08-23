import type { Access, CollectionConfig, FieldAccess } from 'payload'

import { JWTAuthentication } from 'payload'

import { ROLES } from '@/lib/auth/roles'
import { hasAnyRole, isAdmin } from '@/lib/auth/roles'

const admins: Access = ({ req: { user } }) => isAdmin(user)

const adminsOrSelf: Access = ({ req: { user } }) => {
  if (!user) {
    return false
  }

  if (isAdmin(user)) {
    return true
  }

  return { id: { equals: user.id } }
}

/** Cognito owns these values; nothing in the admin panel or REST API may set them. */
const cognitoManaged: FieldAccess = () => false

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    // Accounts are provisioned just-in-time from Cognito claims, never by hand.
    admin: ({ req: { user } }) => hasAnyRole(user),
    create: () => false,
    delete: admins,
    read: adminsOrSelf,
    unlock: admins,
    update: adminsOrSelf,
  },
  admin: {
    defaultColumns: ['email', 'name', 'roles', 'updatedAt'],
    useAsTitle: 'email',
  },
  auth: {
    /**
     * AWS Cognito is the only identity provider this backend trusts. Disabling
     * the local strategy kills password login, registration, forgot-password,
     * reset-password and email verification at the operation level — every one
     * of those endpoints now throws regardless of what is sent to it.
     *
     * `enableFields` keeps the email/session columns so the schema and generated
     * types do not change shape, and so `useAsTitle: 'email'` still works.
     */
    disableLocalStrategy: {
      enableFields: true,
      optionalPassword: true,
    },
    /**
     * Disabling the local strategy also unregisters Payload's built-in JWT
     * cookie reader, so we register it explicitly. Tokens are still minted only
     * by the Cognito callback route after a verified OIDC handshake.
     */
    strategies: [
      {
        name: 'cognito-jwt',
        authenticate: JWTAuthentication,
      },
    ],
  },
  fields: [
    {
      // Merged over Payload's base auth email field.
      name: 'email',
      type: 'email',
      access: { update: cognitoManaged },
      admin: {
        description: 'Synced from the Cognito email claim on every sign-in.',
        readOnly: true,
      },
    },
    {
      name: 'name',
      type: 'text',
      admin: {
        description: 'Synced from Cognito on sign-in; local edits are overwritten.',
      },
    },
    {
      name: 'cognitoSub',
      type: 'text',
      access: { update: cognitoManaged },
      admin: {
        description: 'Immutable Cognito user identifier.',
        position: 'sidebar',
        readOnly: true,
      },
      index: true,
      label: 'Cognito subject',
      unique: true,
    },
    {
      name: 'roles',
      type: 'select',
      access: { update: cognitoManaged },
      admin: {
        description:
          'Derived from Cognito group membership on every sign-in. Change the group in Cognito, not here.',
        position: 'sidebar',
        readOnly: true,
      },
      hasMany: true,
      options: ROLES.map((role) => ({ label: role, value: role })),
      saveToJWT: true,
    },
  ],
}
