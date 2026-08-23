/**
 * Roles are owned by Cognito, not by Payload. They are mirrored onto the local
 * user document on every login purely so that access control functions and the
 * admin UI have something local to read — never edit them by hand, the next
 * login will overwrite whatever you set.
 */
export const ROLES = ['admin', 'editor'] as const

export type Role = (typeof ROLES)[number]

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value)

type MaybeUser = { roles?: (string | null)[] | null } | null | undefined

export const hasRole = (user: MaybeUser, role: Role): boolean =>
  Array.isArray(user?.roles) && user.roles.includes(role)

/** Any recognised role is enough to reach the admin panel. */
export const hasAnyRole = (user: MaybeUser): boolean =>
  Array.isArray(user?.roles) && user.roles.some((role) => isRole(role))

export const isAdmin = (user: MaybeUser): boolean => hasRole(user, 'admin')
