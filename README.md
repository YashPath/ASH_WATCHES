# ASH_ — 3D Watch Store

Full-stack portfolio project: browse watches as interactive 3D models, search with natural language, pay with Stripe or cash on delivery.

| Layer | Stack |
|---|---|
| Storefront | Next.js 15 (App Router, React 19), React Three Fiber / drei, Tailwind |
| API | Express 4, TypeScript (ESM), Zod, Pino, Prisma 5 + PostgreSQL |
| Security | argon2id, 15-min JWT + rotating httpOnly refresh cookie with reuse detection, TOTP MFA for admins (AES-256-GCM at rest), Helmet/CSP, Redis rate limits, CSRF origin check, signed media URLs, upload sniffing |
| Payments | Stripe Checkout, idempotent webhooks, reconcile/expiry jobs (BullMQ) |
| Search | ChromaDB vectors + Postgres full-text, fused with Reciprocal Rank Fusion; Postgres stays the source of truth |
| Infra | Docker Compose, nginx edge, GitHub Actions CI |

```
apps/api      Express API (+ src/search: Chroma, embeddings, hybrid search, indexing queue)
apps/web      Next.js storefront
prisma        schema, migrations, seed
infra         nginx edge + Chroma auth gateway
docs          full documentation, start at docs/README.md
```

**New developer?** Read `docs/README.md` (index), then `docs/ARCHITECTURE.md` and `CONTRIBUTING.md`. Showing it to a client: `docs/DEMO.md`.

## Quick start (development)

Prerequisites: Node ≥ 20.18, pnpm 9, Docker (for Postgres/Redis/Chroma).

```bash
cp .env.example .env          # replace every CHANGE_ME; generate secrets with: openssl rand -base64 48
pnpm install
docker run -d --name ash-pg -p 5432:5432 -e POSTGRES_USER=ash -e POSTGRES_PASSWORD=ash_dev_password -e POSTGRES_DB=ash_watch postgres:16-alpine
docker run -d --name ash-redis -p 6379:6379 redis:7-alpine
docker run -d --name ash-chroma -p 8000:8000 chromadb/chroma:1.5.9
pnpm exec prisma db push      # see prisma/BASELINE.md for proper migrations
pnpm --filter @ash/api seed:demo   # 12 demo watches + demo customer (demo@ash.test / Demo-Customer-2026!)
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='long-passphrase' pnpm --filter @ash/api create:admin
pnpm api:dev                  # http://localhost:4000  (health /health, readiness /ready)
pnpm --filter @ash/web dev    # http://localhost:3000
pnpm --filter @ash/api search:reindex   # build the search index after seeding
```

The web app proxies `/api/v1` and `/media-public` to the API (`API_INTERNAL_URL`, default `http://localhost:4000`), so the refresh cookie is first-party. Set `FRONTEND_ORIGIN=http://localhost:3000` in `.env`.

## Search

`GET /api/v1/search?q=…` runs two retrievers in parallel and fuses them:

1. **Keyword**: Postgres `websearch_to_tsquery` with weighted fields (name/brand > description > body).
2. **Semantic**: Chroma nearest-neighbour on product embeddings, with metadata filters (price, gender, movement, brand, category).

If Chroma or the embedding provider fails, results come from keyword search only (`meta.mode = "keyword-only"`); a circuit breaker stops hammering a dead service. Chroma only proposes IDs: each result is re-read from Postgres and dropped if it is no longer visible.

`POST /api/v1/search/assistant` parses budget/gender/movement/occasion from free text ("automatic dive watch for men under ₹50,000") and runs the same search. It is rule-based, not an LLM.

**Embedding providers** (`EMBEDDING_PROVIDER`): `openai`, `ollama` (local, free), or `hash`. **`hash` is offline lexical feature hashing, not true semantic search**; use `openai` or `ollama` for real semantics. Each provider/model gets its own Chroma collection, so switching providers never mixes vector spaces: after switching run `pnpm --filter @ash/api search:reindex`. Paid embeddings are capped per hour (`EMBEDDING_HOURLY_BUDGET`) and cached.

Index maintenance: admin product/variant edits enqueue a (debounced, hash-skipping) index job; a nightly job reconciles everything; admins can check `GET /api/v1/admin/search/status` and trigger `POST /api/v1/admin/search/reindex`.

## Production-shaped stack

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, CHROMA_AUTH_TOKEN (openssl rand -hex 32) and all secrets
docker compose up --build -d
```

Compose runs Postgres, Redis, Chroma on an internal-only network behind a bearer-token nginx gateway (Chroma 1.x has no simple static-token auth), the API, the web app and an nginx edge on port 80. For a real server with HTTPS (Caddy) use the production overlay; see **docs/DEPLOY.md**.

## Testing

```bash
pnpm --filter @ash/api test       # unit tests (intent parser, RRF fusion, search documents)
pnpm --filter @ash/api test:int   # 46 API integration tests; needs Postgres + Redis (Chroma optional: search tests skip without it)
pnpm --filter @ash/web test       # unit tests
pnpm --filter @ash/web exec playwright test   # browser e2e against a running, seeded stack (API + web)
pnpm --filter @ash/api typecheck && pnpm --filter @ash/web typecheck
```

Integration tests cover auth (rotation, reuse detection, CSRF, lockout), cart/orders (including concurrent last-unit purchase and cancel-restock), Stripe webhook handling (signed test events: idempotency, amount mismatch, expiry, refunds), admin guards and hybrid search. CI runs all of it (`.github/workflows/ci.yml`). Set `E2E_STRIPE=1` with real Stripe test keys to also assert the redirect to checkout.stripe.com.

## Features at a glance

Storefront: 3D viewer with exploded view (zoom in to separate the parts), shop filters, natural-language search, similar products, wishlist, reviews (moderated), cart, Stripe or cash-on-delivery checkout, policy pages (shipping, returns, warranty, privacy, terms, contact), order history with detail/printable invoice. Accounts: email verification, password reset, rotating refresh tokens. Admin: product add/edit (details, brands/categories, photo upload, variants, stock), orders (ship/deliver, COD aware), 30-day dashboard (revenue, orders, top products), review moderation, search index status/rebuild; admins must enroll TOTP (`/admin-mfa-enroll`).

## Known limitations (be upfront about these in interviews)

- Order and webhook flows are tested against real Postgres/Redis, but Stripe checkout-session creation has never run against the live Stripe API (webhooks are tested with locally signed events). Try it with Stripe test keys before relying on it.
- Policy pages are template wording for a small store; the owner (and a lawyer) must review them and set `NEXT_PUBLIC_CONTACT_EMAIL` before going live.
- Cash on delivery has no courier integration, serviceable-PIN check or COD fee; the admin marks orders shipped and delivered by hand.
- The exploded 3D view works only on the procedural model, not on uploaded GLBs.
- The migrations directory has no baseline migration (see `prisma/BASELINE.md`).
- Assistant is rule-based; semantic quality depends on the embedding provider (`hash` is lexical).
- 3D: five procedural watch styles (dress, diver, chronograph, skeleton, field) are picked from the product's category and tags; products without an uploaded GLB show a procedural illustrative watch; the colours follow the selected variant.
- Email uses SMTP in production; in development emails are logged.

See `SECURITY.md` for the threat model and `docs/BACKEND-NOTES.md` for Redis, Stripe CLI and TOTP migration notes.
