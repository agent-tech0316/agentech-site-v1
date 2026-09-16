import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  redirects: async () => [
    {
      source: "/:path*",
      has: [{ type: "host", value: "agent-tech.ai" }],
      destination: "https://www.agent-tech.ai/:path*",
      permanent: true
    }
  ]
};

export default nextConfig;
