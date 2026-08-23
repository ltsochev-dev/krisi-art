import type { ClassValue } from 'clsx'

import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Conditional class names, with later Tailwind utilities beating earlier ones.
 *
 * `clsx` flattens the arguments (strings, arrays, `{ 'is-open': open }` objects,
 * falsy values dropped); `twMerge` then resolves same-property conflicts, so a
 * caller's `className` can override a component's own default —
 * `cn('px-4 font-serif', 'px-6')` is `'font-serif px-6'`, not both paddings.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
