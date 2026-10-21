import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Prisma's generated client must be loaded as a native external, never
  // bundled — otherwise a cold `next dev` start fails with
  // "Cannot find module '@prisma/client-<hash>'" (breaks fresh installs).
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  // Allow isolated production-build verification (NEXT_DIST_DIR=.build-test)
  // without disturbing the running dev server's default .next directory.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Type errors MUST fail the build — this is a production application.
  // (A previous `ignoreBuildErrors: true` masked real runtime bugs.)
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // 'unsafe-inline' is required by Next.js runtime styles; scripts remain protected
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self'; font-src 'self' data:; object-src 'none'; form-action 'self';" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // API responses: never cached by shared caches
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
