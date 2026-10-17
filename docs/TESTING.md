# Testing and verification

## Commands

| Command | What it runs | Needs |
|---|---|---|
| `pnpm --filter @ash/api typecheck` / `pnpm --filter @ash/web typecheck` | TypeScript | nothing |
| `pnpm --filter @ash/api test` | API unit tests | nothing |
| `pnpm --filter @ash/web test` | Web unit tests | nothing |
| `pnpm --filter @ash/api test:int` | 46 integration tests against real Postgres + Redis (truncates the DB, never point it at real data) | Postgres, Redis (Chroma optional) |
| `pnpm --filter @ash/web e2e` | 14 Playwright browser tests | running API + web, seeded DB (`seed:demo`) |
| `pnpm audit --prod` | Dependency vulnerabilities | network |

CI (`.github/workflows/ci.yml`) runs all of the above.

## What the integration tests cover

Auth (rotation, reuse detection, CSRF, lockout), catalogue filters, cart, order creation (server-side price, stock, concurrent last-unit purchase, cancel and restock), Stripe webhook handling with locally signed events (idempotency, amount mismatch, expiry, refunds), cash on delivery (confirm, ship, deliver, cancel, ownership), admin guards and catalogue management, malformed and oversized bodies, hybrid search.

## What the e2e tests cover

Home with 3D hero, shop filters and natural-language search, product page with 3D viewer and variants, sign-in redirect flow, wrong password, add to cart, Stripe-path checkout, COD checkout, policy pages, phone layout, wishlist, review rules, forgot-password privacy, invalid reset links, order detail. Set `E2E_STRIPE=1` with real Stripe test keys to also assert the redirect to checkout.stripe.com.

Tip: the login limiter is deliberate. If e2e runs fail at sign-in after many repeats, clear the Redis keys `rl:*` (`redis-cli --scan --pattern 'rl:*' | xargs redis-cli del`) or wait.

## Also checked by hand (not automated)

- 100+ security probes: IDOR on orders and addresses, price tampering, SQL-injection strings, CSRF and CORS, rate limits, path traversal, source maps in production.
- axe-core (WCAG 2 A/AA) on about 22 routes, desktop and phone: 0 violations.
- Production-mode run behind Caddy with HTTPS, real SMTP delivery to a local sink.
- Visual check of each 3D watch style, assembled and exploded.

## What has NOT been verified

- Stripe Checkout session creation against the live Stripe API (only signed webhook events were tested).
- A real email provider (only a local SMTP sink).
- The Dockerfiles and `docker-compose.prod.yml` were never built (no Docker daemon was available).
- Real-phone 3D performance.
- Prisma note: the tests in this project's history were run on a Prisma 6.19 rust-free client because the build sandbox could not download Prisma engines. The repo pins Prisma 5.22; CI uses that. If a Prisma-specific difference shows up, trust CI.
