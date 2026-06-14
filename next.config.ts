import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/zkyc/api/artifacts/:path*",
        destination: "https://zkyc.solutions/api/artifacts/:path*",
      },
    ];
  },
};

export default nextConfig;
