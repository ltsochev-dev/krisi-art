import type { Role } from '../roles'

import { ROLES } from '../roles'

export type CognitoConfig = {
  /** OAuth2 authorize endpoint on the Hosted UI domain. */
  authorizeEndpoint: string
  clientId: string
  /** Only set for confidential app clients. Absent means a public client (PKCE only). */
  clientSecret?: string
  /** Hosted UI origin, e.g. https://my-pool.auth.eu-central-1.amazoncognito.com */
  domain: string
  /** OIDC issuer — also the `iss` claim we require on every token. */
  issuer: string
  jwksUri: string
  /** Hosted UI sign-out endpoint. */
  logoutEndpoint: string
  /** Where Cognito sends the browser after sign-out. Must be an allowed sign-out URL. */
  logoutRedirectUri: string
  /** Cognito group name -> Payload role. Membership in none of these denies access. */
  roleByGroup: Record<string, Role>
  /** Must exactly match the callback URL registered on the app client. */
  redirectUri: string
  region: string
  scopes: string[]
  userPoolId: string
}

class CognitoConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CognitoConfigError'
  }
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '')

/** Accepts a bare host or a full URL and always yields a scheme-qualified origin. */
const normaliseDomain = (value: string): string => {
  const trimmed = trimTrailingSlash(value.trim())
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const required = (name: string): string => {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new CognitoConfigError(
      `Missing required environment variable ${name}. See .env.example for the full Cognito setup.`,
    )
  }

  return value
}

/**
 * Base URL this app is reachable at. Used to build the redirect/sign-out URLs
 * that must be registered on the Cognito app client, so it has to be the
 * externally visible origin — not whatever the container thinks it is.
 */
const getAppUrl = (): string => {
  const value = (process.env.APP_URL || process.env.NEXT_PUBLIC_SERVER_URL)?.trim()

  if (!value) {
    throw new CognitoConfigError(
      'Missing required environment variable APP_URL (or NEXT_PUBLIC_SERVER_URL). ' +
        'It must be the public origin of this app, e.g. https://admin.krisi.art',
    )
  }

  return trimTrailingSlash(value)
}

const buildRoleByGroup = (): Record<string, Role> => {
  const roleByGroup: Record<string, Role> = {}

  for (const role of ROLES) {
    const envVar = `COGNITO_${role.toUpperCase()}_GROUP`
    const group = process.env[envVar]?.trim()

    if (!group) {
      continue
    }

    /*
     * The map is keyed by group name, so pointing two role variables at the same
     * Cognito group would silently let the last one win and grant the wrong role.
     * Fail loudly instead: leave the unused variable unset.
     */
    const claimedBy = roleByGroup[group]

    if (claimedBy) {
      throw new CognitoConfigError(
        `Cognito group "${group}" is mapped to more than one Payload role ` +
          `(COGNITO_${claimedBy.toUpperCase()}_GROUP and ${envVar}). Each role needs its own ` +
          'group, or leave the unused variable empty.',
      )
    }

    roleByGroup[group] = role
  }

  if (Object.keys(roleByGroup).length === 0) {
    throw new CognitoConfigError(
      'No Cognito group is mapped to a Payload role. Set at least COGNITO_ADMIN_GROUP ' +
        `(recognised roles: ${ROLES.join(', ')}).`,
    )
  }

  return roleByGroup
}

let cached: CognitoConfig | undefined

/**
 * Resolved lazily rather than at import time so that `next build` and any
 * tooling that imports this module still work without Cognito credentials.
 */
export const getCognitoConfig = (): CognitoConfig => {
  if (cached) {
    return cached
  }

  const region = required('COGNITO_REGION')
  const userPoolId = required('COGNITO_USER_POOL_ID')
  const clientId = required('COGNITO_CLIENT_ID')
  const domain = normaliseDomain(required('COGNITO_DOMAIN'))
  const appUrl = getAppUrl()
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`

  cached = {
    authorizeEndpoint: `${domain}/oauth2/authorize`,
    clientId,
    clientSecret: process.env.COGNITO_CLIENT_SECRET?.trim() || undefined,
    domain,
    issuer,
    jwksUri: `${issuer}/.well-known/jwks.json`,
    logoutEndpoint: `${domain}/logout`,
    logoutRedirectUri: process.env.COGNITO_LOGOUT_REDIRECT_URI?.trim() || `${appUrl}/admin/login`,
    redirectUri: process.env.COGNITO_REDIRECT_URI?.trim() || `${appUrl}/api/auth/cognito/callback`,
    region,
    roleByGroup: buildRoleByGroup(),
    scopes: (process.env.COGNITO_SCOPES?.trim() || 'openid email profile').split(/\s+/),
    userPoolId,
  }

  return cached
}

/** Lets the login screen render a useful message instead of throwing. */
export const getCognitoConfigError = (): null | string => {
  try {
    getCognitoConfig()
    return null
  } catch (error) {
    return error instanceof CognitoConfigError ? error.message : 'Cognito is not configured.'
  }
}
