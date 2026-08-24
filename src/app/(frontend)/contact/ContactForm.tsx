'use client'

/**
 * The contact form.
 *
 * `useActionState` wires the form straight to the server action, so validation
 * errors and the editor-configured success message come back without any
 * client-side fetch. `website` is the honeypot the action checks — it stays in
 * the markup and only a bot fills it in.
 *
 * The server is the authority on every rule in `@/lib/validation/contact`; the
 * `required` and `maxLength` attributes here are conveniences that save a round
 * trip, not the check itself. Rate limiting and the honeypot verdict come back
 * as a form-level error, which is why that banner is not tied to a field.
 */
import React, { useActionState } from 'react'

import { CircleAlert, CircleCheck, LoaderCircle, Send } from 'lucide-react'

import { contactFormInitialState } from '@/lib/actions/contact-state'
import { submitContactForm } from '@/lib/actions/contact'
import { CONTACT_LIMITS } from '@/lib/validation/contact'

const FIELD =
  'w-full rounded-lg border border-border bg-background px-4 py-3 font-sans text-sm text-foreground transition-colors duration-300 placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none'

const LABEL = 'mb-2 block font-sans text-xs tracking-widest text-muted-foreground uppercase'

const ERROR = 'mt-2 flex items-center gap-1.5 font-sans text-xs text-destructive-light'

interface Props {
  formIntro?: null | string
}

export const ContactForm = ({ formIntro }: Props) => {
  const [state, formAction, pending] = useActionState(submitContactForm, contactFormInitialState)

  if (state.status === 'success') {
    return (
      <div className="rounded-2xl border border-primary/30 bg-card p-10 text-center">
        <CircleCheck className="mx-auto mb-4 text-primary" size={32} />
        <p className="font-serif text-xl text-foreground">{state.message}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-8 md:p-10">
      {formIntro ? <p className="mb-8 text-sm text-muted-foreground">{formIntro}</p> : null}

      {/* Form-level failures: a tripped rate limit, or a storage error. Field
          problems render under their own input instead. */}
      {state.status === 'error' ? (
        <p
          role="alert"
          className="mb-6 flex items-start gap-2 rounded-lg border border-destructive-light/40 bg-destructive/20 p-4 font-sans text-sm text-destructive-light"
        >
          <CircleAlert className="mt-0.5 shrink-0" size={16} />
          {state.message}
        </p>
      ) : null}

      <form action={formAction} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="contact-name">
              Name
            </label>
            <input
              aria-describedby={state.errors?.name ? 'contact-name-error' : undefined}
              aria-invalid={state.errors?.name ? true : undefined}
              className={FIELD}
              id="contact-name"
              maxLength={CONTACT_LIMITS.name}
              name="name"
              placeholder="Your name"
              required
              type="text"
            />
            {state.errors?.name ? (
              <p className={ERROR} id="contact-name-error">
                <CircleAlert size={13} />
                {state.errors.name}
              </p>
            ) : null}
          </div>

          <div>
            <label className={LABEL} htmlFor="contact-email">
              Email
            </label>
            <input
              aria-describedby={state.errors?.email ? 'contact-email-error' : undefined}
              aria-invalid={state.errors?.email ? true : undefined}
              className={FIELD}
              id="contact-email"
              maxLength={CONTACT_LIMITS.email}
              name="email"
              placeholder="you@example.com"
              required
              type="email"
            />
            {state.errors?.email ? (
              <p className={ERROR} id="contact-email-error">
                <CircleAlert size={13} />
                {state.errors.email}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="contact-subject">
            Subject <span className="normal-case">(optional)</span>
          </label>
          <input
            aria-describedby={state.errors?.subject ? 'contact-subject-error' : undefined}
            aria-invalid={state.errors?.subject ? true : undefined}
            className={FIELD}
            id="contact-subject"
            maxLength={CONTACT_LIMITS.subject}
            name="subject"
            placeholder="Commission enquiry"
            type="text"
          />
          {state.errors?.subject ? (
            <p className={ERROR} id="contact-subject-error">
              <CircleAlert size={13} />
              {state.errors.subject}
            </p>
          ) : null}
        </div>

        <div>
          <label className={LABEL} htmlFor="contact-message">
            Message
          </label>
          <textarea
            aria-describedby={state.errors?.message ? 'contact-message-error' : undefined}
            aria-invalid={state.errors?.message ? true : undefined}
            className={`${FIELD} resize-y`}
            id="contact-message"
            maxLength={CONTACT_LIMITS.message}
            name="message"
            placeholder="Tell me about your vision…"
            required
            rows={7}
          />
          {state.errors?.message ? (
            <p className={ERROR} id="contact-message-error">
              <CircleAlert size={13} />
              {state.errors.message}
            </p>
          ) : null}
        </div>

        {/* Honeypot — hidden from people, irresistible to bots. `hidden` rather
            than a visually-hidden class on purpose: a screen reader should not
            offer it either. */}
        <input
          aria-hidden="true"
          autoComplete="off"
          hidden
          name="website"
          tabIndex={-1}
          type="text"
        />

        <button
          className="inline-flex items-center gap-3 rounded-full bg-primary px-8 py-4 font-sans text-sm tracking-widest text-primary-foreground uppercase transition-colors duration-300 hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
          type="submit"
        >
          {pending ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}
          {pending ? 'Sending…' : 'Send message'}
        </button>
      </form>
    </div>
  )
}
