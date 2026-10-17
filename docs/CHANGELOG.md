# Project history

What was built, in the order it happened, so a new developer can see how the project got here.

## 1. Foundation
- Monorepo (pnpm): `apps/api` (Express, TypeScript, Prisma, PostgreSQL), `apps/web` (Next.js, React Three Fiber, Tailwind).
- Auth: argon2id, short-lived JWT, rotating refresh cookie with reuse detection, email verification, password reset, TOTP MFA for admins.
- Catalogue, variants, cart, addresses, orders with row-locked stock, Stripe Checkout and signed webhooks, BullMQ jobs for expiring orders and reconciling sessions.
- Search: Postgres full-text plus ChromaDB vectors fused with Reciprocal Rank Fusion; header suggestions; similar products; rule-based "Find my watch" assistant.
- Security hardening: Helmet and CSP, Redis rate limits, CSRF origin check, signed media URLs, audit log.

## 2. Storefront experience
- Green theme and a human-style hero.
- 3D watch viewer with an **exploded view**: zoom in and the parts (crystal, hands, dial, gears, case, strap) separate; zoom out and they reassemble.
- Wishlist, reviews (moderated, purchasers only), order detail page and printable invoice.

## 3. Admin
- Product add/edit form with brands, categories, photo upload, variants and stock.
- Orders (ship/deliver) and review moderation; search index status and rebuild.

## 4. Quality pass
- Unit, integration and Playwright tests, CI workflow.
- Expert audit: malformed or oversized JSON now returns 400/413 instead of 500; unconfigured Stripe returns 503 with a clear message; uploaded media URLs are relative so the CSP allows them; accessibility fixes (contrast, link styling, landmark labels).
- Dependency upgrade to Next 15 / React 19 and `nodemailer` 10, `sharp` 0.35, `file-type` 21; `pnpm audit --prod` is clean.
- Production-mode run behind Caddy with HTTPS and SMTP verified.
- Deploy files: `docker-compose.prod.yml`, `infra/caddy/Caddyfile`, `docs/DEPLOY.md`.

## 5. Client-ready pass
- Five 3D watch styles (dress, diver, chrono, skeleton, field).
- Cash on delivery (migration `20261016090000_cod_payment`): checkout choice, `POST /orders/:id/cod`, admin ship/deliver flow, payment settles on delivery, 4 integration tests.
- Policy pages (shipping, returns, warranty, privacy, terms) and a contact page, linked from the footer.
- Admin dashboard: 30-day revenue, orders, average order, top products, revenue chart.
- Developer documentation (this folder).

## Known gaps
See "Known limitations" in the root `README.md` and "What has NOT been verified" in `docs/TESTING.md`.
