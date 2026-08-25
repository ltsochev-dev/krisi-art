import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(__filename);

// Production CloudFront distribution, hardcoded on purpose. `images` is
// evaluated by `next build` and frozen into `.next/required-server-files.json`,
// which the standalone server reads instead of re-evaluating this file — so a
// host that only reaches the container through the runtime `.env` never becomes
// an allowed pattern, and every `/_next/image?url=https://<cdn>/...` request
// 400s with `"url" parameter is not allowed`. Keep this in sync with
// `S3_CDN_URL` on the VPS.
const PRODUCTION_CDN_HOSTNAME = "d1qo73ikqa11i8.cloudfront.net";

// Mirrors `normaliseCdnUrl` in `src/lib/aws/s3.ts`: accepts a bare hostname or a
// full origin. Only the host matters here. Still honoured on top of the
// hardcoded host so a different bucket/distribution works without a code edit —
// but only when it is present at build time.
const cdnHostname = (() => {
  const raw = process.env.S3_CDN_URL?.trim().replace(/\/+$/, "");

  if (!raw) {
    return undefined;
  }

  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
  } catch {
    return undefined;
  }
})();

const cdnHostnames = [
  ...new Set([PRODUCTION_CDN_HOSTNAME, cdnHostname].filter(Boolean)),
] as string[];

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // `localPatterns` stays for the no-CDN path, where media is still served
    // from `/api/media/file/...` by this server.
    localPatterns: [
      {
        pathname: "/api/media/file/**",
      },
    ],
    // With a CDN configured, `next/image` call sites (the about collage, the
    // hero) receive CloudFront URLs and would otherwise be rejected as an
    // unconfigured host.
    remotePatterns: cdnHostnames.map((hostname) => ({
      protocol: "https" as const,
      hostname,
      pathname: "/**",
    })),
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      ".cjs": [".cts", ".cjs"],
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };

    return webpackConfig;
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
        source: "/admin/logout",
        destination: "/api/auth/cognito/logout",
        permanent: false,
      },
      {
        source: "/admin/logout-inactivity",
        destination: "/api/auth/cognito/logout",
        permanent: false,
      },
    ];
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
