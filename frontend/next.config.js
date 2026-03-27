// ============================================================
//  Smart Money Analytics — next.config.js
//
//  Docs: https://nextjs.org/docs/app/api-reference/next-config-js
// ============================================================

/** @type {import('next').NextConfig} */
const nextConfig = {

  // ── React strict mode ────────────────────────────────────
  // Highlights potential issues during development.
  // Causes components to render twice in dev (intentional).
  reactStrictMode: true,

  // ── Environment variables ────────────────────────────────
  // Variables prefixed with NEXT_PUBLIC_ are automatically
  // exposed to the browser bundle. Never prefix secret keys.
  //
  // Set these in .env.local for local dev:
  //   NEXT_PUBLIC_API_URL=http://localhost:3000
  //
  // Set them in Vercel's Environment Variables dashboard for prod:
  //   NEXT_PUBLIC_API_URL=https://your-render-app.onrender.com
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
  },

  // ── HTTP Security Headers ────────────────────────────────
  // Applied to every response. Hardens the app against common
  // web vulnerabilities (XSS, clickjacking, MIME sniffing).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options",           value: "DENY" },
          { key: "X-Content-Type-Options",     value: "nosniff" },
          { key: "Referrer-Policy",            value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection",           value: "1; mode=block" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  // ── Image domains ────────────────────────────────────────
  // Add external domains here if you render token logos via next/image.
  // Example: images: { domains: ["assets.coingecko.com"] }
  images: {
    domains: [],
  },

  // ── Redirects ────────────────────────────────────────────
  // Uncomment to redirect /home → /
  // async redirects() {
  //   return [{ source: "/home", destination: "/", permanent: true }];
  // },
};

module.exports = nextConfig;
