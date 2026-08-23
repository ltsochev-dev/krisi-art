'use client'

import { LogOutIcon } from '@payloadcms/ui'
import React from 'react'

/**
 * Replaces Payload's default logout link, which only clears the local cookie.
 * Ours also ends the Cognito Hosted UI session, otherwise the next sign-in
 * would silently re-authenticate the same person without a prompt.
 */
export const CognitoLogoutButton: React.FC<{ tabIndex?: number }> = ({ tabIndex = 0 }) => (
  // A plain anchor, not next/link: this route replies with a 302 to the Cognito
  // Hosted UI, and a client-side transition cannot follow a cross-origin
  // redirect. A full document navigation is required.
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  <a
    aria-label="Log out"
    className="nav__log-out"
    href="/api/auth/cognito/logout"
    tabIndex={tabIndex}
    title="Log out"
  >
    <LogOutIcon />
  </a>
)

export default CognitoLogoutButton
