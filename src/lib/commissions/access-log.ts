/**
 * Writing to the commission access log.
 *
 * One entry point, shared by the public endpoints and the unlock server action,
 * so every row is shaped the same way and no caller has to remember to parse a
 * user-agent string.
 *
 * **Logging never fails the request it is logging.** A download that worked
 * must not turn into a 500 because a log insert did — so every error here is
 * caught and reported through `payload.logger`. The log is a record of what
 * happened, not a participant in it.
 */
import type { Payload, PayloadRequest } from 'payload'

import type { Commission } from '@/payload-types'

import { getClientIp, parseUserAgent } from './request'

export type CommissionAccessEvent =
  'denied' | 'download' | 'unlock-failed' | 'unlock-success' | 'view'

export type CommissionDeniedReason = 'disabled' | 'expired' | 'no-password' | 'rate-limited'

export const logCommissionAccess = async ({
  commissionId,
  event,
  fileId,
  filename,
  headers,
  payload,
  reason,
  req,
}: {
  commissionId: Commission['id']
  event: CommissionAccessEvent
  fileId?: string
  filename?: string
  headers: Headers
  payload: Payload
  reason?: CommissionDeniedReason
  /** Threaded through so the row joins the caller's transaction when there is one. */
  req?: PayloadRequest
}): Promise<void> => {
  const userAgent = headers.get('user-agent')
  const { browser, deviceType, os } = parseUserAgent(userAgent)

  try {
    await payload.create({
      collection: 'commission-access-log',
      data: {
        browser,
        commission: commissionId,
        deviceType,
        event,
        fileId,
        filename,
        ip: getClientIp(headers),
        os,
        referer: headers.get('referer') ?? undefined,
        reason,
        userAgent: userAgent ?? undefined,
      },
      depth: 0,
      // The collection blocks `create` for everyone; this is the only writer,
      // and the Local API bypasses access control by design.
      overrideAccess: true,
      ...(req ? { req } : {}),
    })
  } catch (error) {
    payload.logger.error(
      { commissionId, err: error, event },
      'Could not write a commission access-log row.',
    )
  }
}

/**
 * How recently an identical view counts as the same visit.
 *
 * A client who opens the link, closes the tab and opens it again ten minutes
 * later has visited once as far as the artist is concerned. Without this the
 * counter measures page loads, which is a much less interesting number.
 */
export const VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000

/**
 * Whether this IP and user-agent already have a `view` row inside the window.
 *
 * The pair is a weak identity — two people behind one NAT on the same phone
 * model collapse into one visitor — and that is the right side to err on:
 * over-counting a shared office as several visits would tell the artist someone
 * kept coming back when nobody did.
 */
export const hasRecentView = async ({
  commissionId,
  headers,
  payload,
  req,
}: {
  commissionId: Commission['id']
  headers: Headers
  payload: Payload
  req?: PayloadRequest
}): Promise<boolean> => {
  const since = new Date(Date.now() - VIEW_DEDUPE_WINDOW_MS).toISOString()
  const userAgent = headers.get('user-agent')

  const { docs } = await payload.find({
    collection: 'commission-access-log',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    ...(req ? { req } : {}),
    where: {
      and: [
        { commission: { equals: commissionId } },
        { createdAt: { greater_than: since } },
        { event: { equals: 'view' } },
        { ip: { equals: getClientIp(headers) } },
        /**
         * A request with no user-agent stores `null`, and `equals: ''` does not
         * match a null column — so the absent case needs `exists` rather than a
         * comparison, or every UA-less caller would count as a fresh visit.
         */
        userAgent ? { userAgent: { equals: userAgent } } : { userAgent: { exists: false } },
      ],
    },
  })

  return docs.length > 0
}
