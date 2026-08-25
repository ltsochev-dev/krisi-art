/**
 * Same-origin redirects for the auth routes.
 *
 * The `Location` header these emit is deliberately a **path**, never an absolute
 * URL built from `request.url`. Next composes `request.url` from the hostname the
 * server was told to bind to rather than from the `Host` header:
 *
 * ```js
 * const initUrl = this.fetchHostname && this.port
 *   ? `${protocol}://${this.fetchHostname}:${this.port}${req.url}`
 *   : this.nextConfig.experimental.trustHostHeader ? ... : req.url
 * // node_modules/next/dist/server/next-server.js — attachRequestMeta
 * ```
 *
 * In the deployed container that hostname is `0.0.0.0` and the port is `3000`
 * (`ENV HOSTNAME`/`ENV PORT` in the Dockerfile — the container has to bind to
 * every interface to accept proxied traffic at all), while `protocol` comes from
 * the `X-Forwarded-Proto: https` the reverse proxy adds. So `request.url` reads
 * `https://0.0.0.0:3000/...`, and anything resolved against it sends the browser
 * to an address that exists only inside the container.
 *
 * `APP_URL` is not the fix either, though it would work: a relative `Location` is
 * resolved by the browser against the URL it actually requested (RFC 9110
 * §10.2.2), which is the public one by definition — so this stays correct even if
 * the app is reached on an origin nobody configured.
 *
 * Safe as an open-redirect matter because every path that reaches here is either
 * a literal at the call site or a `getSafeRedirect` result, and that helper
 * rejects protocol-relative and scheme-bearing values.
 */

/** A 302 to a path on this app, preserving any cookies already on `headers`. */
export const redirectToPath = (path: string, headers = new Headers()): Response => {
  headers.set('Cache-Control', 'no-store')
  headers.set('Location', path)

  return new Response(null, { headers, status: 302 })
}
