'use server'

/**
 * Contact form submission.
 *
 * A server action rather than a REST endpoint: the form gets CSRF protection and
 * `useActionState` progressive enhancement for free, and it keeps another route
 * out of the `/api/*` namespace that Payload owns. All the validation lives in
 * `@/lib/validation/contact`, so a REST endpoint can be added later without
 * duplicating the rules.
 *
 * Ordering matters here: the submission is persisted *before* the notification
 * email is attempted, so a Resend outage never loses a message. The email result
 * is then written back onto the row for triage.
 */
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import type { ContactFieldErrors, ContactInput } from '@/lib/validation/contact'

import { checkRateLimit } from '@/lib/rate-limit'
import { contactInputFromFormData, validateContactInput } from '@/lib/validation/contact'
import config from '@/payload.config'

/** Five submissions per IP per fifteen minutes. */
const RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 }

const FALLBACK_SUCCESS = 'Thanks — your message is on its way.'
const GENERIC_FAILURE = 'Something went wrong sending your message. Please try again shortly.'

export type ContactFormState = {
  errors?: ContactFieldErrors
  message: string
  status: 'error' | 'idle' | 'success'
}

export const contactFormInitialState: ContactFormState = { message: '', status: 'idle' }

const clientIp = (requestHeaders: Headers): string => {
  const forwarded = requestHeaders.get('x-forwarded-for')

  if (forwarded) {
    // Left-most entry is the original client when the proxy chain is trusted.
    const first = forwarded.split(',')[0]?.trim()

    if (first) {
      return first
    }
  }

  return requestHeaders.get('x-real-ip')?.trim() || 'unknown'
}

const notificationBody = (input: Required<Omit<ContactInput, 'honeypot'>>): string =>
  [
    `From: ${input.name} <${input.email}>`,
    input.subject ? `Subject: ${input.subject}` : null,
    '',
    input.message,
  ]
    .filter((line) => line !== null)
    .join('\n')

export const submitContactForm = async (
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> => {
  const payload = await getPayload({ config: await config })
  const contactPage = await payload.findGlobal({
    slug: 'contact-page',
    depth: 0,
    overrideAccess: true,
  })
  const successMessage = contactPage.successMessage || FALLBACK_SUCCESS

  const validation = validateContactInput(contactInputFromFormData(formData))

  if (!validation.ok) {
    // A tripped honeypot gets the success response — never tell a bot which
    // check caught it. Nothing is stored and nothing is emailed.
    if (validation.formError === 'REJECTED_HONEYPOT') {
      return { message: successMessage, status: 'success' }
    }

    return {
      errors: validation.errors,
      message: 'Please check the highlighted fields.',
      status: 'error',
    }
  }

  const requestHeaders = await getHeaders()
  const rateLimit = checkRateLimit({ key: `contact:${clientIp(requestHeaders)}`, ...RATE_LIMIT })

  if (!rateLimit.allowed) {
    return {
      message: `Too many messages from this connection. Please try again in ${Math.ceil(
        rateLimit.retryAfter / 60,
      )} minute(s).`,
      status: 'error',
    }
  }

  let submissionId: number | undefined

  try {
    const submission = await payload.create({
      collection: 'contact-submissions',
      data: {
        email: validation.value.email,
        message: validation.value.message,
        name: validation.value.name,
        status: 'new',
        subject: validation.value.subject || undefined,
        userAgent: requestHeaders.get('user-agent') ?? undefined,
      },
      depth: 0,
      // The collection blocks `create` for everyone; this action is the only
      // writer, and the Local API bypasses access control by design.
      overrideAccess: true,
    })

    submissionId = submission.id
  } catch (error) {
    payload.logger.error({ err: error }, 'Failed to store a contact submission.')

    return { message: GENERIC_FAILURE, status: 'error' }
  }

  const recipients = (contactPage.notifyRecipients ?? [])
    .map((row) => row.email)
    .filter((email): email is string => Boolean(email))

  const to = recipients.length
    ? recipients
    : (process.env.CONTACT_NOTIFY_EMAIL?.trim() || process.env.RESEND_FROM_ADDRESS?.trim() || '')

  if (!to || (Array.isArray(to) && to.length === 0)) {
    payload.logger.warn(
      `Contact submission ${submissionId} stored, but no notification recipient is configured.`,
    )

    return { message: successMessage, status: 'success' }
  }

  try {
    await payload.sendEmail({
      replyTo: validation.value.email,
      subject: validation.value.subject
        ? `Contact form: ${validation.value.subject}`
        : `Contact form message from ${validation.value.name}`,
      text: notificationBody(validation.value),
      to,
    })

    await payload.update({
      collection: 'contact-submissions',
      data: { emailSent: true },
      id: submissionId,
      overrideAccess: true,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)

    payload.logger.error(
      { err: error },
      `Contact submission ${submissionId} was stored but the notification email failed.`,
    )

    await payload
      .update({
        collection: 'contact-submissions',
        data: { emailError: reason.slice(0, 500), emailSent: false },
        id: submissionId,
        overrideAccess: true,
      })
      .catch(() => {
        // Already logged above; the message itself is safely stored.
      })
  }

  // The message is stored either way, so the visitor sees success even if the
  // notification bounced — the row in the Inbox is the source of truth.
  return { message: successMessage, status: 'success' }
}
