/**
 * `POST /api/commissions/:uuid/track` — public.
 *
 * Records that someone opened the page. Fired once from the client component
 * rather than from the server render, because a `<meta>`-scraping preview bot
 * (Slack, WhatsApp, Signal) fetches the HTML but never runs an effect — so link
 * unfurls do not inflate the counter.
 *
 * Keyed on the UUID, not on the document id: the client only ever holds a UUID,
 * and a public route that took a sequential id would be enumerable.
 */
import type { Endpoint } from 'payload'

import { checkRateLimit } from '@/lib/rate-limit'
import { hasRecentView, logCommissionAccess } from '@/lib/commissions/access-log'
import { getClientIp } from '@/lib/commissions/request'
import { evaluateCommissionGate, findCommissionRecordByUuid } from '@/lib/content/commissions'

import { publicNotFound, routeParam, tooManyRequests } from './shared'

/** Generous — one page load fires this once, and a refresh is not abuse. */
const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 }

export const trackCommissionViewEndpoint: Endpoint = {
  path: '/:uuid/track',
  method: 'post',
  handler: async (req) => {
    const uuid = routeParam(req, 'uuid')

    if (!uuid) {
      return publicNotFound()
    }

    const rateLimit = checkRateLimit({
      key: `commission-track:${getClientIp(req.headers)}`,
      ...RATE_LIMIT,
    })

    if (!rateLimit.allowed) {
      return tooManyRequests(rateLimit.retryAfter)
    }

    const commission = await findCommissionRecordByUuid({ payload: req.payload, req, uuid })

    if (!commission) {
      return publicNotFound()
    }

    const gate = evaluateCommissionGate(commission)

    if (!gate.ok) {
      /**
       * The reason is logged and not returned. A caller who is told "expired"
       * rather than "not available" has learned that the UUID was real once,
       * which is exactly the thing possession of the UUID is supposed to prove.
       */
      await logCommissionAccess({
        commissionId: commission.id,
        event: 'denied',
        headers: req.headers,
        payload: req.payload,
        reason: gate.reason,
        req,
      })

      return publicNotFound()
    }

    /**
     * `lastAccessedAt` is updated on every call, but the counter and the log row
     * only on a view that is not a repeat of a recent one — otherwise the
     * counter measures page loads rather than visits. See `VIEW_DEDUPE_WINDOW_MS`.
     */
    const repeat = await hasRecentView({
      commissionId: commission.id,
      headers: req.headers,
      payload: req.payload,
      req,
    })

    if (!repeat) {
      await logCommissionAccess({
        commissionId: commission.id,
        event: 'view',
        headers: req.headers,
        payload: req.payload,
        req,
      })
    }

    await req.payload.update({
      collection: 'commissions',
      id: commission.id,
      data: {
        lastAccessedAt: new Date().toISOString(),
        ...(repeat ? {} : { viewCount: (commission.viewCount ?? 0) + 1 }),
      },
      depth: 0,
      // The counters are server-owned fields; this is their writer.
      overrideAccess: true,
      req,
    })

    return new Response(null, { status: 204 })
  },
}
