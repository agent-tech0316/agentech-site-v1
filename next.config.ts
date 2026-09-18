import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  rewrites: async () => [
    {
      source: "/download/app",
      destination: "https://navi-app-download.wesleyfan2015.chatgpt.site/download/app/"
    },
    {
      source: "/download/app-files/:path*",
      destination: "https://navi-app-download.wesleyfan2015.chatgpt.site/downloads/:path*"
    }
  ],
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
