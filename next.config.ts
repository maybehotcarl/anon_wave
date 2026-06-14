import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/zkyc/api/auth/wallet/challenge",
        destination: "https://zkyc.solutions/api/auth/wallet/challenge",
      },
      {
        source: "/api/zkyc/api/auth/wallet/verify",
        destination: "https://zkyc.solutions/api/auth/wallet/verify",
      },
      {
        source: "/api/zkyc/api/zk",
        destination: "https://zkyc.solutions/api/zk",
      },
      {
        source: "/api/zkyc/api/meta",
        destination: "https://zkyc.solutions/api/meta",
      },
      {
        source: "/api/zkyc/api/artifacts/:path*",
        destination: "https://zkyc.solutions/api/artifacts/:path*",
      },
    ];
  },
};

export default nextConfig;
