/**
 * The password gate's `useActionState` shape.
 *
 * Deliberately *not* in `./actions.ts`, for the same reason
 * `@/lib/actions/contact-state` is not in `@/lib/actions/contact`: that module
 * carries `'use server'`, and such a file may only export async functions —
 * every export becomes a callable server reference, so a plain object trips
 * Next's `invalid-use-server-value` check at build time. The type alone would
 * have been fine (types are erased), but `commissionUnlockInitialState` is a
 * real runtime value.
 *
 * `message` is nullable rather than an empty string because the success case has
 * nothing to say: the page re-renders with the file list on it, which is the
 * whole feedback.
 */
export type CommissionUnlockState = {
  message: null | string
  status: 'error' | 'idle' | 'success'
}

export const commissionUnlockInitialState: CommissionUnlockState = {
  message: null,
  status: 'idle',
}
