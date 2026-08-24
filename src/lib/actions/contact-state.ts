/**
 * The contact form's `useActionState` shape.
 *
 * Deliberately *not* in `./contact.ts`. That module carries `'use server'`, and
 * such a file may only export async functions — every export becomes a callable
 * server reference, so a plain object trips Next's
 * `invalid-use-server-value` check at build time. The type alone would have been
 * fine (types are erased), but `contactFormInitialState` is a real runtime value.
 *
 * Kept next to the action rather than in `@/lib/validation/contact` because this
 * is transport state between the action and the form, not a validation rule.
 */
import type { ContactFieldErrors } from '@/lib/validation/contact'

export type ContactFormState = {
  errors?: ContactFieldErrors
  message: string
  status: 'error' | 'idle' | 'success'
}

export const contactFormInitialState: ContactFormState = { message: '', status: 'idle' }
