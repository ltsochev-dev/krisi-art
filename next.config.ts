import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(__filename);

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    localPatterns: [
      {
        pathname: "/api/media/file/**",
      },
    ],
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
