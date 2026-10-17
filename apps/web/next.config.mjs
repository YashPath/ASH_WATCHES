import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const isProd = process.env.NODE_ENV === 'production';

// The browser only ever talks to this origin; Next proxies /api and /media-public to the API.
// That keeps the httpOnly refresh cookie first-party and removes the need for cross-origin CORS in the browser.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'"
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: root,
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['three'],
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` },
      { source: '/media-public/:path*', destination: `${API_URL}/media-public/:path*` }
    ];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.stripe.com")' },
        ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : [])
      ]
    }];
  }
};
export default nextConfig;
