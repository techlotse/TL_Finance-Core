/** @type {import('next').NextConfig} */

// Content-Security-Policy tuned for Next.js + Recharts + Inter (Google Fonts).
// Tightened per TL Finance Core security requirements.
// nginx adds HSTS and frame/XSS headers for the multinode stack;
// these headers are the safety net for single-node and dev deployments.
const cspDirectives = [
  "default-src 'self'",
  // Next.js requires 'unsafe-inline' for its inline style injection
  // and 'unsafe-eval' for dev HMR only — locked down in production.
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "X-Frame-Options",
    value: "DENY"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=(), payment=()"
  },
  // Only add HSTS at the Next.js layer when not behind nginx
  // (nginx adds it for multinode; redundant but harmless here).
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains"
  }
];

const nextConfig = {
  reactStrictMode: true,
  // Recharts is published as ESM in some versions; transpile to be safe.
  transpilePackages: ["recharts"],
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders
      }
    ];
  }
};

export default nextConfig;
