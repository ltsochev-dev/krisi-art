import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(__filename);

// Mirrors `normaliseCdnUrl` in `src/lib/aws/s3.ts`: accepts a bare hostname or a
// full origin. Only the host matters here.
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
    ...(cdnHostname
      ? {
          remotePatterns: [
            {
              protocol: "https" as const,
              hostname: cdnHostname,
              pathname: "/**",
            },
          ],
        }
      : {}),
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
