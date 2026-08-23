/**
 * Contact form validation.
 *
 * Hand-rolled rather than pulling in a schema library: this is the only form on
 * the site, and the rules are six lines of logic. Kept in its own module so the
 * server action and any future REST endpoint validate identically, and so the
 * rules are unit-testable without a Payload instance.
 */
export const CONTACT_LIMITS = {
  email: 254,
  message: 5000,
  name: 120,
  subject: 200,
} as const

/** Minimum body length — anything shorter is almost always a bot. */
const MIN_MESSAGE_LENGTH = 10

export type ContactFieldName = 'email' | 'message' | 'name' | 'subject'

export type ContactInput = {
  email: string
  /** Honeypot. Must stay empty; real browsers never fill a hidden field. */
  honeypot?: string
  message: string
  name: string
  subject?: string
}

export type ContactFieldErrors = Partial<Record<ContactFieldName, string>>

export type ContactValidationResult =
  | { errors: ContactFieldErrors; formError?: string; ok: false }
  | { ok: true; value: Required<Omit<ContactInput, 'honeypot'>> }

/**
 * Intentionally simple: one `@`, something either side, a dot in the domain.
 * Anything stricter rejects valid addresses, and delivery is the real test.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

const readString = (value: FormDataEntryValue | null | undefined): string =>
  typeof value === 'string' ? value.trim() : ''

/** Pulls the fields off a `FormData`, ready for `validateContactInput`. */
export const contactInputFromFormData = (formData: FormData): ContactInput => ({
  email: readString(formData.get('email')),
  honeypot: readString(formData.get('website')),
  message: readString(formData.get('message')),
  name: readString(formData.get('name')),
  subject: readString(formData.get('subject')),
})

export const validateContactInput = (input: ContactInput): ContactValidationResult => {
  const name = input.name?.trim() ?? ''
  const email = input.email?.trim() ?? ''
  const subject = input.subject?.trim() ?? ''
  const message = input.message?.trim() ?? ''

  // A filled honeypot is a bot. Report success-shaped failure at the call site
  // instead of telling the bot which check caught it.
  if (input.honeypot && input.honeypot.trim() !== '') {
    return { errors: {}, formError: 'REJECTED_HONEYPOT', ok: false }
  }

  const errors: ContactFieldErrors = {}

  if (name === '') {
    errors.name = 'Please tell us your name.'
  } else if (name.length > CONTACT_LIMITS.name) {
    errors.name = `Keep this under ${CONTACT_LIMITS.name} characters.`
  }

  if (email === '') {
    errors.email = 'Please add an email address so we can reply.'
  } else if (email.length > CONTACT_LIMITS.email || !EMAIL_PATTERN.test(email)) {
    errors.email = 'That does not look like a valid email address.'
  }

  if (subject.length > CONTACT_LIMITS.subject) {
    errors.subject = `Keep this under ${CONTACT_LIMITS.subject} characters.`
  }

  if (message === '') {
    errors.message = 'Please write a message.'
  } else if (message.length < MIN_MESSAGE_LENGTH) {
    errors.message = 'Please write a little more.'
  } else if (message.length > CONTACT_LIMITS.message) {
    errors.message = `Keep this under ${CONTACT_LIMITS.message} characters.`
  }

  if (Object.keys(errors).length > 0) {
    return { errors, ok: false }
  }

  return { ok: true, value: { email, message, name, subject } }
}
