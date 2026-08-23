import type { ServerProps } from 'payload'

import { Button } from '@payloadcms/ui'
import React from 'react'
import { getSafeRedirect } from 'payload/shared'

import { getCognitoConfigError } from '@/lib/auth/cognito/config'

/**
 * Failure codes set by the callback route. Kept deliberately vague — the useful
 * detail is in the server log, not on a public login screen.
 */
const FAILURE_MESSAGES: Record<string, string> = {
  access_denied:
    'Your Cognito account is not a member of a group that grants access to this admin panel.',
  config: 'Cognito sign-in is not configured on this server. Contact an administrator.',
  exchange_failed: 'Cognito rejected the sign-in attempt. Please try again.',
  invalid_state: 'Your sign-in attempt expired or could not be verified. Please try again.',
  provider_error: 'Cognito reported an error during sign-in. Please try again.',
  server_error: 'Something went wrong while signing you in. Please try again.',
}

const notice: React.CSSProperties = {
  border: '1px solid var(--theme-error-250)',
  background: 'var(--theme-error-50)',
  borderRadius: 'var(--style-radius-s)',
  color: 'var(--theme-error-750)',
  fontSize: '0.9rem',
  lineHeight: 1.4,
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) / 2)',
}

const firstValue = (value: unknown): string | undefined => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined
  }

  return typeof value === 'string' ? value : undefined
}

export const CognitoLoginButton: React.FC<ServerProps> = ({ searchParams }) => {
  const failure = firstValue(searchParams?.cognitoError)
  const configError = getCognitoConfigError()

  // Carry the originally requested admin page through the OIDC round trip.
  const redirect = getSafeRedirect({
    fallbackTo: '/admin',
    redirectTo: firstValue(searchParams?.redirect) ?? '',
  })

  const href = `/api/auth/cognito/login?redirect=${encodeURIComponent(redirect)}`

  return (
    <div>
      {failure ? (
        <p role="alert" style={notice}>
          {FAILURE_MESSAGES[failure] ?? FAILURE_MESSAGES.server_error}
        </p>
      ) : null}

      {configError ? (
        <p role="alert" style={notice}>
          {configError}
        </p>
      ) : (
        <Button buttonStyle="primary" el="anchor" size="large" url={href}>
          Continue with AWS Cognito
        </Button>
      )}

      <p
        style={{
          color: 'var(--theme-elevation-500)',
          fontSize: '0.8rem',
          marginTop: 'calc(var(--base) / 2)',
        }}
      >
        This admin panel has no local passwords. Accounts and permissions are managed entirely in
        AWS Cognito.
      </p>
    </div>
  )
}

export default CognitoLoginButton
