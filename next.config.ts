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
 * **There is deliberately no `remotePatterns` entry for the commissions
 * bucket, and adding one back would re-open the hole that took the VPS down.**
 *
 * A gallery used to draw its tiles through `next/image`, so the private
 * bucket's host had to be an allowed pattern. It no longer does — previews are
 * resized once at upload and served straight from S3, see
 * `@/lib/commissions/thumbnails` — which means the entry was not merely dead
 * config.
 *
 * A commission page hands the browser presigned URLs for the *originals*: the
 * viewer needs one to show the photograph. While this host was allowed, anyone
 * holding one of those URLs — every visitor, and anyone they forwarded the link
 * to — could ask `/_next/image?url=<that URL>` and make this server download a
 * 20MB original from S3 and decode it, as many times at once as they liked. On
 * a two-core box that is a denial of service with no authentication in front of
 * it, and it is what turned a slow album into an unreachable host: load average
 * in the hundreds, sshd starved, nothing left to log into.
 *
 * Without the pattern that request is refused before a byte moves ("url"
 * parameter is not allowed). Nothing on either commission layout needs the
 * optimiser now, so there is nothing to weigh against it.
 */
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
     * Everything the optimiser still handles is a public, immutable object
     * behind the CDN — the portfolio's artwork, the hero, the about collage —
     * so the only thing a short TTL buys is this server re-fetching and
     * re-encoding files that did not change. A day is a conservative floor
     * rather than a tuned number.
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
    ],
  },
  /**
   * The image optimiser, tuned for a small VPS rather than for a build server.
   *
   * These were set when a gallery commission drew all 220 of its tiles through
   * here, each one a 10-megapixel original pulled from S3 and decoded. Served
   * one at a time that is under a second each; served all at once it collapses,
   * and the measurements are not subtle — ten concurrent requests against the
   * deployed container came back as nine gateway timeouts after 170 seconds
   * apiece, having taken 0.5s each sequentially a minute earlier.
   *
   * **That is why galleries no longer use it at all**: the previews are made
   * once, at upload, and stored in the bucket — see
   * `@/lib/commissions/thumbnails`, which also explains the hardcoded
   * seven-second upstream fetch timeout that no setting below can reach. What
   * is left for the optimiser is the public site's own images, which are small,
   * few and behind a CDN; these three settings stay because nothing about them
   * costs anything there.
   *
   * Two separate causes, one setting each:
   *
   * - `imgOptConcurrency` caps the threads *libvips* uses per image. Left alone
   *   it is half the core count per concurrent request, so a burst of tiles
   *   spawns far more threads than the box has cores and every one of them holds
   *   a share of a decoded bitmap. One thread per image is slower in isolation
   *   and dramatically cheaper under load, which is the case that matters here.
   * - `imgOptTimeoutInSeconds` defaults to **7** and bounds the sharp pipeline,
   *   so an image that would have finished in nine seconds is abandoned and
   *   answered 500 — and the failure is not cached, so the next visitor starts
   *   it again. Thirty is long enough that a queued image waits rather than
   *   fails. **Note what it does not cover.** The *upstream fetch* has its own
   *   `AbortSignal.timeout(7000)`, hardcoded in
   *   `next/dist/server/image-optimizer.js` with no setting behind it, and on a
   *   burst of multi-megabyte originals that is the timeout that actually
   *   fires. Raising this one was where we first looked and it changed nothing.
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
