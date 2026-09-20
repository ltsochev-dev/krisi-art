import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(__filename)

// Production CloudFront distribution, hardcoded on purpose. `images` is
// evaluated by `next build` and frozen into `.next/required-server-files.json`,
// which the standalone server reads instead of re-evaluating this file — so a
// host that only reaches the container through the runtime `.env` never becomes
// an allowed pattern, and every `/_next/image?url=https://<cdn>/...` request
// 400s with `"url" parameter is not allowed`. Keep this in sync with
// `S3_CDN_URL` on the VPS.
const PRODUCTION_CDN_HOSTNAME = 'd1qo73ikqa11i8.cloudfront.net'

// Mirrors `normaliseCdnUrl` in `src/lib/aws/s3.ts`: accepts a bare hostname or a
// full origin. Only the host matters here. Still honoured on top of the
// hardcoded host so a different bucket/distribution works without a code edit —
// but only when it is present at build time.
const cdnHostname = (() => {
  const raw = process.env.S3_CDN_URL?.trim().replace(/\/+$/, '')

  if (!raw) {
    return undefined
  }

  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
  } catch {
    return undefined
  }
})()

const cdnHostnames = [
  ...new Set([PRODUCTION_CDN_HOSTNAME, cdnHostname].filter(Boolean)),
] as string[]

/**
 * The private commissions bucket, hardcoded for exactly the reason the CDN host
 * above is: `images` is frozen into `.next/required-server-files.json` at build
 * time, so a value that only exists in the container's runtime `.env` never
 * becomes an allowed pattern.
 *
 * A gallery commission draws its grid with `next/image` — see
 * `@/components/commission/CommissionGallery` — so every tile is a
 * `/_next/image?url=https://<this host>/...` request. Without this entry each
 * one 400s with `"url" parameter is not allowed` and the album renders as a grid
 * of broken images.
 */
const PRODUCTION_COMMISSIONS_HOSTNAME = 'krisi-commission-files.s3.eu-west-2.amazonaws.com'

/**
 * The same host worked out from the environment, for any other checkout.
 *
 * Mirrors how `@/lib/aws/s3` addresses the bucket: virtual-host style against
 * real S3, and the endpoint's own host for an S3-compatible provider (MinIO,
 * R2, Spaces), where path-style keeps the bucket in the path and virtual-host
 * style puts it in front of the endpoint.
 */
const commissionsHostname = (() => {
  const bucket = process.env.S3_COMMISSIONS_BUCKET?.trim()
  const region = process.env.S3_REGION?.trim()
  const endpoint = process.env.S3_ENDPOINT?.trim()

  if (!bucket) {
    return undefined
  }

  if (!endpoint) {
    return region ? `${bucket}.s3.${region}.amazonaws.com` : undefined
  }

  try {
    const { hostname } = new URL(endpoint.includes('://') ? endpoint : `https://${endpoint}`)

    return process.env.S3_FORCE_PATH_STYLE === 'true' ? hostname : `${bucket}.${hostname}`
  } catch {
    return undefined
  }
})()

const commissionsHostnames = [
  ...new Set([PRODUCTION_COMMISSIONS_HOSTNAME, commissionsHostname].filter(Boolean)),
] as string[]

const nextConfig: NextConfig = {
  output: 'standalone',
  // `X-Powered-By: Next.js` only tells a scanner which framework to try CVEs
  // against. Nothing reads it.
  poweredByHeader: false,
  images: {
    // `localPatterns` stays for the no-CDN path, where media is still served
    // from `/api/media/file/...` by this server.
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
    /**
     * Optimised copies are held for a day rather than the default four hours.
     *
     * A commission gallery's `src` is a presigned URL pinned to a signing
     * window (`GALLERY_URL_WINDOW_SECONDS`), and the optimiser caches on the
     * `src` it was given — so a cache entry is useful right up until the window
     * rotates and the URL changes. Expiring sooner than that would have this
     * server re-downloading and re-encoding an album of 150 originals several
     * times inside one window, which is the work this whole arrangement exists
     * to do once.
     */
    minimumCacheTTL: 86_400,
    remotePatterns: [
      // With a CDN configured, `next/image` call sites (the about collage, the
      // hero) receive CloudFront URLs and would otherwise be rejected as an
      // unconfigured host.
      ...cdnHostnames.map((hostname) => ({
        protocol: 'https' as const,
        hostname,
        pathname: '/**',
      })),
      /**
       * The commission galleries.
       *
       * **`search` is deliberately omitted, which allows any query string** —
       * and a presigned URL is *entirely* query string, so pinning one here
       * would reject every image. That is not a hole: the bucket has public
       * access blocked, so a URL under this host is worthless without a valid
       * SigV4 signature, which only this server can mint. Anyone holding one
       * already has the object and does not need the optimiser to fetch it for
       * them.
       */
      ...commissionsHostnames.map((hostname) => ({
        protocol: 'https' as const,
        hostname,
        pathname: '/**',
      })),
    ],
  },
  /**
   * The image optimiser, tuned for a small VPS rather than for a build server.
   *
   * A gallery commission is the only page on this site that asks it for more
   * than a handful of images at once: 220 tiles, each one a 10-megapixel
   * original pulled from S3 and decoded. Served one at a time that is under a
   * second each; served all at once it collapses, and the measurements are not
   * subtle — ten concurrent requests against the deployed container came back as
   * nine gateway timeouts after 170 seconds apiece, having taken 0.5s each
   * sequentially a minute earlier.
   *
   * Two separate causes, one setting each:
   *
   * - `imgOptConcurrency` caps the threads *libvips* uses per image. Left alone
   *   it is half the core count per concurrent request, so a burst of tiles
   *   spawns far more threads than the box has cores and every one of them holds
   *   a share of a decoded bitmap. One thread per image is slower in isolation
   *   and dramatically cheaper under load, which is the case that matters here.
   * - `imgOptTimeoutInSeconds` defaults to **7**, which is the number that turns
   *   a slow queue into a broken page: an image that would have finished in nine
   *   seconds is abandoned and answered 500, and the failure is not cached, so
   *   the next visitor starts it again. Thirty is long enough that a queued
   *   image waits rather than fails.
   *
   * `imgOptSequentialRead` reads the source progressively instead of holding the
   * whole decoded frame, which is what libvips recommends for exactly this shape
   * of work — large JPEGs shrunk to thumbnails.
   */
  experimental: {
    imgOptConcurrency: 1,
    imgOptSequentialRead: true,
    imgOptTimeoutInSeconds: 30,
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
  // Payload still ships its own logout views, which only clear the local cookie
  // and would leave the Cognito Hosted UI session alive. Funnel every logout
  // path through the route that ends both sessions.
  async redirects() {
    return [
      {
        source: '/admin/logout',
        destination: '/api/auth/cognito/logout',
        permanent: false,
      },
      {
        source: '/admin/logout-inactivity',
        destination: '/api/auth/cognito/logout',
        permanent: false,
      },
    ]
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
