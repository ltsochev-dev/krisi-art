'use client'

/**
 * The password prompt for a commission the artist put a password on.
 *
 * `useActionState` wires the form straight to `unlockCommission`, exactly as the
 * contact form does with `submitContactForm`: the verdict comes back as state
 * with no client-side fetch, and the form still submits with JavaScript
 * disabled. Every failure — wrong password, expired link, no such commission —
 * comes back as the same sentence, so this component has no idea which happened
 * and cannot leak it.
 *
 * The gate deliberately shows the client **nothing** about the commission, not
 * even its title. It is the whole reason the page renders this instead of the
 * file list, so a heading naming the piece would give away the one thing the
 * password is protecting.
 *
 * `router.refresh()` on success is what actually reveals the files. The action
 * sets the unlock cookie on its response, but the server component that decided
 * to render this gate has already run — only a fresh request, now carrying the
 * cookie, re-renders that decision.
 */
import React, { useActionState, useEffect } from 'react'

import { useRouter } from 'next/navigation'

import { unlockCommission } from '@/lib/commissions/actions'
import { commissionUnlockInitialState } from '@/lib/commissions/unlock-state'

export default function PasswordGate({ uuid }: { uuid: string }) {
  const [state, formAction, pending] = useActionState(
    unlockCommission,
    commissionUnlockInitialState,
  )
  const router = useRouter()

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh()
    }
  }, [router, state.status])

  // The refresh is a round trip, so the button stays busy through it rather than
  // flicking back to "Unlock" on a form that is about to be replaced.
  const busy = pending || state.status === 'success'

  return (
    <div className="card gate">
      <h1 className="card__title">This delivery is password protected</h1>
      <p className="gate__body">
        Enter the password from the message this link came with to see the files.
      </p>

      {state.status === 'error' && state.message ? (
        <p className="alert" role="alert">
          {state.message}
        </p>
      ) : null}

      <form action={formAction} className="gate__form">
        <input name="uuid" type="hidden" value={uuid} />

        {/* The placeholder is the visible label; this one is for a screen
            reader, which should not have to infer the field from it. */}
        <label htmlFor="commission-password" hidden>
          Password
        </label>
        <input
          autoComplete="current-password"
          className="gate__input"
          id="commission-password"
          name="password"
          placeholder="Password"
          required
          type="password"
        />

        <button className="button" disabled={busy} type="submit">
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
