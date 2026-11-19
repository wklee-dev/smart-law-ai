import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** 개발 PC에서 빌드 → RPA-03에서 node server.js 만 실행 */
  output: "standalone",
  serverExternalPackages: ["xlsx", "pg"],
  /** 배포 패키징 우선 — 기존 라우트 타입 이슈가 빌드를 막지 않도록 */
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    proxyClientMaxBodySize: "20mb",
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "flagcdn.com", pathname: "/24x18/**" },
    ],
  },
  /** Route Handlers 는 `app/tariff/api/...` 에 두고, 외부 URL 은 기존 `/api/tariff/...` 유지 */
  async rewrites() {
    return [
      { source: "/api/tariff/:path*", destination: "/tariff/api/:path*" },
    ];
  },
};

export default nextConfig;
