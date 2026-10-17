# Decisions and why

1. **Same-origin proxy instead of CORS.** `/api/v1` is proxied by Next (dev) or Caddy (prod). The refresh cookie stays first-party and `SameSite` can be strict-ish. Cost: the web app must know `API_INTERNAL_URL` at build time for rewrites.
2. **CSRF with Origin check plus custom header.** No cookie-based CSRF tokens. Every mutating request must come from `FRONTEND_ORIGIN` and carry `X-CSRF-Token`.
3. **Integer minor units, server-side prices.** Avoids float errors and price tampering.
4. **Stock reserved at order creation.** Simple and safe against overselling (row locks, `FOR UPDATE`); pending orders expire through a BullMQ job to release stock.
5. **Postgres is the source of truth, Chroma is a cache.** Search can degrade to full-text and the index can be rebuilt.
6. **`hash` embeddings as the default.** Works with zero external services but is lexical, not semantic. Switch `EMBEDDING_PROVIDER` to `openai` or `ollama` for real semantic search.
7. **Procedural 3D watch instead of a GLB.** No asset pipeline needed, colours follow variants, and the exploded view is possible because every part is a named group. Trade-off: it is illustrative, not photoreal.
8. **COD as a payment provider value, not a new order status.** A COD order stays `PENDING` with a `COD`/`PROCESSING` payment until an admin ships it; delivery settles the payment. Avoids touching the Stripe state machine.
9. **Admins must use TOTP.** Admin access tokens carry `mfa: true`; without it admin routes refuse.
10. **Next 15 and React 19** were adopted to clear known Next 14 vulnerabilities.
11. **Policy pages are static templates** in `apps/web/lib/policies.ts`, easy to edit, and must be reviewed by the store owner.
