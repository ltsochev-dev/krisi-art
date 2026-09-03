/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkRateLimit, resetRateLimits } from '@/lib/rate-limit'

const WINDOW = { limit: 3, windowMs: 60_000 }

describe('checkRateLimit', () => {
  afterEach(() => {
    resetRateLimits()
    vi.useRealTimers()
  })

  it('allows requests up to the limit', () => {
    const results = Array.from({ length: 3 }, () => checkRateLimit({ key: 'a', ...WINDOW }).allowed)

    expect(results).toEqual([true, true, true])
  })

  it('blocks the request that exceeds the limit', () => {
    for (let i = 0; i < WINDOW.limit; i++) {
      checkRateLimit({ key: 'a', ...WINDOW })
    }

    const blocked = checkRateLimit({ key: 'a', ...WINDOW })

    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)
  })

  it('tracks keys independently', () => {
    for (let i = 0; i < WINDOW.limit; i++) {
      checkRateLimit({ key: 'a', ...WINDOW })
    }

    expect(checkRateLimit({ key: 'a', ...WINDOW }).allowed).toBe(false)
    expect(checkRateLimit({ key: 'b', ...WINDOW }).allowed).toBe(true)
  })

  it('lets the window slide', () => {
    vi.useFakeTimers()

    for (let i = 0; i < WINDOW.limit; i++) {
      checkRateLimit({ key: 'a', ...WINDOW })
    }

    expect(checkRateLimit({ key: 'a', ...WINDOW }).allowed).toBe(false)

    vi.advanceTimersByTime(WINDOW.windowMs + 1)

    expect(checkRateLimit({ key: 'a', ...WINDOW }).allowed).toBe(true)
  })

  it('does not let a blocked caller reset their own window', () => {
    vi.useFakeTimers()

    for (let i = 0; i < WINDOW.limit; i++) {
      checkRateLimit({ key: 'a', ...WINDOW })
    }

    // Hammering mid-window must not push the expiry out.
    vi.advanceTimersByTime(WINDOW.windowMs - 1_000)
    checkRateLimit({ key: 'a', ...WINDOW })
    vi.advanceTimersByTime(2_000)

    expect(checkRateLimit({ key: 'a', ...WINDOW }).allowed).toBe(true)
  })
})
