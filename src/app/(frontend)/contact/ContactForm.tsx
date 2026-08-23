'use client'

/**
 * The contact form.
 *
 * `useActionState` wires the form straight to the server action, so validation
 * errors and the editor-configured success message come back without any
 * client-side fetch. `website` is the honeypot the action checks — it stays in
 * the markup and only a bot fills it in.
 */
import React, { useActionState } from 'react'

import { contactFormInitialState, submitContactForm } from '@/lib/actions/contact'

export const ContactForm = () => {
  const [state, formAction, pending] = useActionState(submitContactForm, contactFormInitialState)

  if (state.status === 'success') {
    return <p>{state.message}</p>
  }

  return (
    <form action={formAction}>
      {state.status === 'error' ? <p>{state.message}</p> : null}
      <p>
        <label>
          Name <input name="name" required type="text" />
        </label>
        {state.errors?.name ? <small> {state.errors.name}</small> : null}
      </p>
      <p>
        <label>
          Email <input name="email" required type="email" />
        </label>
        {state.errors?.email ? <small> {state.errors.email}</small> : null}
      </p>
      <p>
        <label>
          Subject <input name="subject" type="text" />
        </label>
        {state.errors?.subject ? <small> {state.errors.subject}</small> : null}
      </p>
      <p>
        <label>
          Message <textarea name="message" required rows={6} />
        </label>
        {state.errors?.message ? <small> {state.errors.message}</small> : null}
      </p>
      {/* Honeypot — hidden from people, irresistible to bots. */}
      <input aria-hidden="true" autoComplete="off" name="website" tabIndex={-1} type="text" hidden />
      <button disabled={pending} type="submit">
        {pending ? 'Sending…' : 'Send'}
      </button>
    </form>
  )
}
