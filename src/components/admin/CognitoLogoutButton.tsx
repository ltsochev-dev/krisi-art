'use client'

import { LogOutIcon, useAuth } from '@payloadcms/ui'
import posthog from 'posthog-js'
import React, { useEffect } from 'react'

const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST,
)

/**
 * Replaces Payload's default logout link, which only clears the local cookie.
 * Ours also ends the Cognito Hosted UI session, otherwise the next sign-in
 * would silently re-authenticate the same person without a prompt.
 */
export const CognitoLogoutButton: React.FC<{ tabIndex?: number }> = ({ tabIndex = 0 }) => {
  const { user } = useAuth()
  const cognitoSub = typeof user?.cognitoSub === 'string' ? user.cognitoSub : null

  useEffect(() => {
    if (!isPostHogConfigured || !cognitoSub) {
      return
    }

    posthog.identify(cognitoSub, {
      email: user?.email,
      name: typeof user?.name === 'string' ? user.name : undefined,
      roles: Array.isArray(user?.roles) ? user.roles : undefined,
    })
  }, [cognitoSub, user?.email, user?.name, user?.roles])

  const handleLogout = () => {
    if (isPostHogConfigured) {
      posthog.reset()
    }
  }

  return (
    // A plain anchor, not next/link: this route replies with a 302 to the Cognito
    // Hosted UI, and a client-side transition cannot follow a cross-origin
    // redirect. A full document navigation is required.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      aria-label="Log out"
      className="nav__log-out"
      href="/api/auth/cognito/logout"
      onClick={handleLogout}
      tabIndex={tabIndex}
      title="Log out"
    >
      <LogOutIcon />
    </a>
  )
}

export default CognitoLogoutButton
