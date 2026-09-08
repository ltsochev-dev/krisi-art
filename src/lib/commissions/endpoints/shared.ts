/**
 * Pieces every commission endpoint needs.
 *
 * Two guards and two response shapes, in one place so that the five handlers
 * cannot drift into answering the same situation differently — which matters
 * most for the public two, where "why" must never reach the caller.
 */
import type { PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { hasCommissionsBucket } from '@/lib/aws/s3'
import { hasAnyRole } from '@/lib/auth/roles'

/**
 * Editors only.
 *
 * Payload's custom endpoints are **unauthenticated by default** — collection
 * access control does not run in front of them — so this is the only thing
 * standing between an anonymous caller and a presigned upload URL. 403 rather
 * than 401 because the admin panel authenticates by cookie and there is no
 * credential to offer.
 */
export const guardEditor = (req: PayloadRequest): void => {
  if (!hasAnyRole(req.user)) {
    throw new APIError('Unauthorized', 403)
  }
}

/**
 * A 503 when there is no bucket to talk to, or `null` when there is.
 *
 * Returned rather than thrown so a handler can `return` it on the first line
 * and read as a straight sequence afterwards. A checkout with no AWS
 * environment should say so plainly instead of surfacing a signature error from
 * inside the SDK — this is the same courtesy `getCognitoConfigError` does for
 * the login screen.
 */
export const storageUnavailable = (): null | Response =>
  hasCommissionsBucket()
    ? null
    : Response.json({ message: 'File storage is not configured on this server.' }, { status: 503 })

/**
 * The public endpoints' only failure response.
 *
 * Every refusal on a public route — no such commission, not enabled yet,
 * expired, no such file — comes back as this exact 404. The caller is never
 * told which, because the difference would confirm that a UUID was, or once
 * was, real. The *reason* goes to the access log instead, where the artist can
 * see it and the client cannot.
 */
export const publicNotFound = (): Response =>
  Response.json({ message: 'This link is not available.' }, { status: 404 })

/** A 429 with the retry hint the limiter worked out. */
export const tooManyRequests = (retryAfter: number): Response =>
  Response.json(
    { message: 'Too many requests from this connection. Please try again shortly.' },
    { headers: { 'Retry-After': String(Math.max(retryAfter, 1)) }, status: 429 },
  )

/** A route param as a string, or `null` when it is missing or not one. */
export const routeParam = (req: PayloadRequest, name: string): null | string => {
  const value = req.routeParams?.[name]

  return typeof value === 'string' && value ? value : null
}

/**
 * The document id from the path.
 *
 * Left as a string and handed to Payload as-is: `findByID` accepts either, and
 * parsing it here would only invent a second opinion about what a valid id
 * looks like.
 */
export const documentId = (req: PayloadRequest): string => {
  const id = routeParam(req, 'id')

  if (!id) {
    throw new APIError('A commission id is required.', 400)
  }

  return id
}
