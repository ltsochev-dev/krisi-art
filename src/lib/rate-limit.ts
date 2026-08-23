/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Scope and limitations, on purpose:
 *
 * - State lives in this process. It is lost on restart and is NOT shared between
 *   instances. The app deploys as a single standalone container (see the
 *   Dockerfile), so that is adequate for throttling a public contact form.
 * - If this ever scales horizontally, or if anything security-critical starts
 *   depending on it, replace it with a shared store (Redis, or a Payload
 *   collection) rather than raising the limits here.
 *
 * It is a courtesy speed bump on top of the honeypot, not an access control.
 */
type Bucket = {
  /** Timestamps of hits inside the current window, oldest first. */
  hits: number[]
}

const buckets = new Map<string, Bucket>()

/** Stop the map growing without bound when many distinct keys come through. */
const MAX_TRACKED_KEYS = 5_000

export type RateLimitResult = {
  allowed: boolean
  /** Seconds until the caller may retry. `0` when allowed. */
  retryAfter: number
}

export const checkRateLimit = ({
  key,
  limit,
  windowMs,
}: {
  key: string
  limit: number
  windowMs: number
}): RateLimitResult => {
  const now = Date.now()
  const cutoff = now - windowMs

  const bucket = buckets.get(key) ?? { hits: [] }
  const hits = bucket.hits.filter((hit) => hit > cutoff)

  if (hits.length >= limit) {
    // Keep the pruned list so a blocked caller does not reset their own window.
    buckets.set(key, { hits })

    const oldest = hits[0] ?? now

    return {
      allowed: false,
      retryAfter: Math.max(Math.ceil((oldest + windowMs - now) / 1000), 1),
    }
  }

  hits.push(now)
  buckets.set(key, { hits })

  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [trackedKey, trackedBucket] of buckets) {
      if (trackedBucket.hits.every((hit) => hit <= cutoff)) {
        buckets.delete(trackedKey)
      }
    }
  }

  return { allowed: true, retryAfter: 0 }
}

/** Test seam. */
export const resetRateLimits = (): void => {
  buckets.clear()
}
