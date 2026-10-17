# ASH_ Watch Commerce — Phase 2 Backend

This folder contains the Phase 2 API source and root pnpm workspace configuration. It must be combined with the Phase 1 `prisma/schema.prisma`, `prisma/seed.ts`, and root `.env.example` from the project foundation before database commands can run. Phase 1's schema is the source of truth for the API's generated Prisma Client.

## Local setup
1. Install Node.js 20.18+ and pnpm 9.
2. Restore the Phase 1 `prisma/` directory into this project root.
3. Copy the root `.env.example` to the root `.env` (next to `package.json` and `prisma/schema.prisma`). This is the single canonical environment file at the monorepo root. Prisma CLI reads this root `.env`, and the API explicitly loads it relative to `apps/api/src/config/env.ts`; do not create `apps/api/.env` or `apps/api/.env.example`. Replace `CHANGE_ME` secrets; generate each independently with `openssl rand -base64 48`.
4. Run `pnpm install`.
5. Run `pnpm db:validate`, `pnpm db:generate`, and `pnpm db:migrate --name init` if the initial migration has not been generated.
6. Run `pnpm db:seed`.
7. Run `pnpm api:dev`.

API endpoints: `http://localhost:4000/api/v1`; health `http://localhost:4000/health`; readiness `http://localhost:4000/ready`; OpenAPI `http://localhost:4000/openapi.json`.

See `apps/api/README.md` for endpoint details and important security limitations.

## Redis failure behaviour

Redis is a required security dependency for rate limiting, one-time MFA challenge consumption, and BullMQ job delivery. The rate-limit store uses a dedicated ioredis client configured with `maxRetriesPerRequest: 1` and `passOnStoreError: false`; requests are blocked when the store cannot be consulted (they may receive a service error rather than bypassing limits). BullMQ uses a separate client configured with `maxRetriesPerRequest: null`. Do not configure rate limiting to pass requests through when Redis is down. The service should be considered not ready if Redis is unavailable; configure monitoring and restart/recovery procedures accordingly.

## Security environment requirements

Production startup requires `EMAIL_PROVIDER=smtp`, SMTP credentials, `COOKIE_SECURE=true`, independent high-diversity values for `JWT_ACCESS_SECRET`, `MEDIA_SIGNING_SECRET`, and `TOTP_ENCRYPTION_KEY`, and a `MEDIA_SIGNING_SECRET` that differs from the JWT secret. Never use `CHANGE_ME` or any example secret in production. Catalogue derivatives are exposed under `${API_PUBLIC_URL}/media-public/<key>` for local development. If `MEDIA_PUBLIC_BASE_URL` is set, the public URL is `${MEDIA_PUBLIC_BASE_URL}/<key>` (without a `/media-public` path segment); signed download URLs are for private originals only. `STRIPE_PAYMENT_METHOD_TYPES` defaults to `card` and accepts only Stripe Checkout methods configured for INR (`card`, `upi`, `netbanking`).

## Existing TOTP secret encryption migration

Before deploying the new API against a database that may contain plaintext `User.twoFactorSecret` values, back up PostgreSQL, set the final `TOTP_ENCRYPTION_KEY`, apply the Prisma migration, and run `pnpm --dir apps/api db:encrypt-totp-secrets` once before starting the API. The script is idempotent for values already marked `v1:` and encrypts both active and pending TOTP secrets with AES-256-GCM.

## Stripe CLI webhook testing

Run the API locally with valid test-mode `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` values. In a separate terminal, forward events to the local raw-body webhook endpoint:

```bash
stripe login
stripe listen --forward-to localhost:4000/api/v1/payments/webhook
```

Copy the `whsec_...` value printed by `stripe listen` into the root `.env` as `STRIPE_WEBHOOK_SECRET`, then restart the API. In another terminal, trigger each event handled by this webhook:

```bash
stripe trigger checkout.session.completed
stripe trigger checkout.session.async_payment_succeeded
stripe trigger checkout.session.async_payment_failed
stripe trigger checkout.session.expired
stripe trigger payment_intent.payment_failed
stripe trigger charge.refunded
```

Stripe CLI fixture events generally do not contain IDs/metadata for an order in your local database. They verify signature parsing and safe handling of unknown events; they do not by themselves prove a real order was paid/refunded. For end-to-end tests, create a test order through the API, complete its Checkout Session using Stripe test card `4242 4242 4242 4242` with a future expiry and any CVC, then verify the corresponding webhook and database state. Use Stripe test fixtures or Dashboard test actions to exercise refunds and asynchronous failures against known test objects.
