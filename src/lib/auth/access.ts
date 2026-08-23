/**
 * Shared access control for the public-facing content collections and globals.
 *
 * Roles themselves are owned by Cognito — see `./roles.ts`. Nothing here decides
 * what a role *is*, it only maps roles onto Payload operations.
 */
import type { Access } from 'payload'

import { hasAnyRole, isAdmin } from '@/lib/auth/roles'

/** Public. Used for reads of content the frontend renders without a session. */
export const anyone: Access = () => true

/** Any recognised Cognito role. Content authoring is not admin-only. */
export const editors: Access = ({ req: { user } }) => hasAnyRole(user)

/** Destructive operations stay with admins. */
export const admins: Access = ({ req: { user } }) => isAdmin(user)

/**
 * Staff see everything; everyone else only sees published rows.
 *
 * Returning a `Where` constraint rather than `false` is what makes the public
 * REST API and the frontend query helpers safe by default — an unpublished
 * artwork is not merely hidden in the UI, it is filtered out of the query.
 */
export const publishedOrEditor: Access = ({ req: { user } }) => {
  if (hasAnyRole(user)) {
    return true
  }

  return {
    published: {
      equals: true,
    },
  }
}
