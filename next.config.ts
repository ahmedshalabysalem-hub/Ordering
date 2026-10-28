import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Menu image uploads are up to 2 MB plus form fields (ADR-011).
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    // Tracking and table links carry secret tokens; never leak them to other sites (ADR-013).
    return [
      { source: "/order/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
