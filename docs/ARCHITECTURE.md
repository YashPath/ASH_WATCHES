# Architecture

## Big picture

```
Browser ──► Caddy/nginx (TLS) ──┬──► web  (Next.js 15, port 3000)  pages, 3D viewer
                                └──► api  (Express, port 4000)      /api/v1/*, /media-public/*
                                        │
                  ┌─────────────────────┼───────────────────────┐
              PostgreSQL            Redis (rate limits,      ChromaDB (vectors,
              source of truth       BullMQ queues)           optional)
```

- **Same-origin by design.** The web app rewrites `/api/v1/*` and `/media-public/*` to the API (`API_INTERNAL_URL`), and in production Caddy routes the same paths straight to the API. The browser therefore only ever talks to one origin, so the httpOnly refresh cookie is first-party and CORS is a non-issue.
- **Postgres is the source of truth.** Chroma only stores search vectors and can be rebuilt at any time (`pnpm --filter @ash/api search:reindex`). If Chroma is down, search falls back to Postgres full-text.
- **Money is integer minor units** (paise) everywhere. Prices are always recomputed on the server from the database; the client never sends a price.

## Repository layout

| Path | What lives there |
|---|---|
| `apps/api/src/app.ts` | Express app: security middleware, `/health`, `/ready`, `/openapi.json`, route mounting |
| `apps/api/src/modules/<name>/*.routes.ts` | One folder per feature: auth, products, cart, orders, payments, reviews, wishlist, addresses, admin |
| `apps/api/src/middleware/` | `auth` (JWT, roles, verified email), `security` (rate limiters, CSRF), `errors`, `upload` |
| `apps/api/src/search/` | Embeddings providers, Chroma client, hybrid search, Reciprocal Rank Fusion, indexing queue |
| `apps/api/src/jobs/` | BullMQ jobs: expire pending orders, reconcile Stripe sessions |
| `apps/api/src/scripts/` | `seed-demo`, `create-admin`, `reindex-search`, TOTP secret migration |
| `apps/web/app/` | App Router pages (shop, product, cart, checkout, account, admin, legal, auth flows) |
| `apps/web/components/` | `ProceduralWatch` (3D model), `WatchCanvas`, `WatchThumb`, header/footer, admin components |
| `apps/web/lib/` | `api.ts` (fetch wrapper with refresh + CSRF), `auth.tsx`, `cart.tsx`, `colors.ts`, `policies.ts` |
| `apps/web/e2e/` | Playwright browser tests |
| `prisma/` | `schema.prisma`, migrations, baseline notes |
| `infra/` | Caddy (recommended), nginx, Chroma auth gateway |
| `docs/` | This documentation |

## Request lifecycle (API)

1. Helmet + CSP, request id, Pino logging.
2. Global rate limiter (Redis), stricter limiters on login, refresh, orders, uploads.
3. Body parsing with size limits; malformed JSON returns 400, oversized returns 413 (not 500).
4. CSRF check on state-changing requests: `Origin` must equal `FRONTEND_ORIGIN` and an `X-CSRF-Token` header of at least 16 characters must be present.
5. `authenticate` verifies the 15-minute access JWT. Admin tokens must carry `mfa: true`.
6. Zod validates input; handlers run Prisma transactions.
7. `errorHandler` maps `AppError` to JSON `{ error: { code, message } }`; unknown errors become a generic 500 without leaking details.

## Order and payment state machine

Order status: `PENDING → PAID → SHIPPED → DELIVERED`, with `CANCELLED` and `REFUNDED` as exits.

```
cart ──POST /orders──► Order PENDING + Payment PENDING   (stock is decremented here, row-locked)
                           │
        ┌──────────────────┴───────────────────┐
  POST /payments/checkout-session        POST /orders/:id/cod
  (Stripe Checkout)                       Payment → provider COD, status PROCESSING
        │                                        │
  Stripe webhook (signed)                 admin: PENDING → SHIPPED → DELIVERED
  checkout.session.completed              on DELIVERED: Payment SUCCEEDED, order.paidAt set
  → Order PAID, Payment SUCCEEDED
        │
  admin: PAID → SHIPPED → DELIVERED
```

Rules worth knowing:
- Stock is reserved when the order is created and returned when it is cancelled or expires (`expire-pending-orders` job).
- A customer may hold at most 3 pending non-COD orders.
- An order that has entered Stripe processing cannot be cancelled through the normal endpoints.
- COD orders cannot start a Stripe session (`400`), and non-COD pending orders cannot be shipped by an admin.
- Webhooks are idempotent (`lastStripeEventId`) and check that the paid amount matches the stored amount.

## Security model (short version)

Full threat model: `SECURITY.md`. Highlights: argon2id passwords, refresh-token rotation with reuse detection, TOTP MFA required for admins (secret encrypted with AES-256-GCM), account lockout, signed media URLs for private files, strict CSP (`img-src 'self' data: blob:`, so uploaded media URLs must be relative), no source maps in production.

## Search

`websearch_to_tsquery` over Postgres plus vector similarity from Chroma, merged with Reciprocal Rank Fusion. `EMBEDDING_PROVIDER` is `hash` (default, lexical only, no external service), `openai` or `ollama`. The admin page shows which provider is active and whether the index is in sync.
