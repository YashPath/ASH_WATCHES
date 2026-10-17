# ASH_ API — Phase 2

## Prerequisites
- Node.js 20.18 or newer
- pnpm 9
- PostgreSQL with the Phase 1 Prisma schema migrated
- Test Stripe account for checkout/webhooks

## Run locally
1. From the monorepo root, copy the root `.env.example` to root `.env` (the API loads this exact root path, regardless of the process working directory; Prisma CLI also reads root `.env`) and set database credentials plus independent random `JWT_ACCESS_SECRET`, `MEDIA_SIGNING_SECRET`, and `TOTP_ENCRYPTION_KEY` values using `openssl rand -base64 48`. Prisma CLI reads root `.env`; do not maintain a second API `.env`.
2. From the monorepo root run `pnpm install` and `pnpm db:generate`.
3. Keep the single canonical `.env` at the monorepo root. Do not create `apps/api/.env` or `apps/api/.env.example`.
4. Run `pnpm --dir apps/api dev`.
5. Health: `GET http://localhost:4000/health`; readiness: `GET http://localhost:4000/ready`; OpenAPI JSON: `GET http://localhost:4000/openapi.json`.

## Routes
- `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`
- `GET /api/v1/products`, `/products/:slug`
- `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PATCH|DELETE /api/v1/cart/items/:id`
- `POST /api/v1/orders`, `GET /api/v1/orders`, `GET /api/v1/orders/:id`, `POST /api/v1/orders/:id/cancel`
- `POST /api/v1/reviews`
- `GET|POST /api/v1/wishlist`, `DELETE /api/v1/wishlist/:productId`
- `GET|POST /api/v1/addresses`, `PUT|DELETE /api/v1/addresses/:id`
- `/api/v1/admin/*` product management, inventory, orders, users, analytics and review moderation
- `POST /api/v1/payments/checkout-session`, `POST /api/v1/payments/webhook`

## Important security notes
- The webhook route is registered before JSON parsing and uses the raw request body.
- For browser-based mutating requests using refresh cookies, send `Origin: FRONTEND_ORIGIN` and `X-CSRF-Token` with at least 16 characters. The production web application must issue and validate a cryptographically random CSRF token; this API middleware currently checks presence and origin, not a server-side token binding.
- Verification and password-reset action tokens are created inside the BullMQ email worker; only the normalized email and action type are stored in Redis jobs. The API supports TOTP enrollment/challenge, signed private-media downloads, and local/S3-compatible media storage. Local catalogue URLs use `${API_PUBLIC_URL}/media-public/<key>`; when `MEDIA_PUBLIC_BASE_URL` is set, catalogue URLs use `${MEDIA_PUBLIC_BASE_URL}/<key>` without a `/media-public` segment. Admin accounts are denied full login until 2FA is enabled.
- Do not expose `private-media` as static content. Production should replace local private storage with a private S3-compatible bucket and short-lived signed URLs.

## Stripe CLI smoke tests

`STRIPE_PAYMENT_METHOD_TYPES` defaults to `card`. Only `card`, `upi`, and `netbanking` are accepted for INR Checkout configuration; configure only methods enabled for your Stripe account.

```bash
stripe login
stripe listen --forward-to localhost:4000/api/v1/payments/webhook
# Set the printed whsec_... as STRIPE_WEBHOOK_SECRET in root .env, then restart the API.
stripe trigger checkout.session.completed
stripe trigger checkout.session.async_payment_succeeded
stripe trigger checkout.session.async_payment_failed
stripe trigger checkout.session.expired
stripe trigger payment_intent.payment_failed
stripe trigger charge.refunded
```

CLI-generated events often reference unknown test objects and therefore only exercise signature verification and safe unknown-event handling. Test real state transitions using a Checkout Session created for a local order and Stripe test mode.
