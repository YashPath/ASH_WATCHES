# Security overview

## Controls implemented
- **Passwords**: argon2id; minimum 12 characters; login rate limited per IP and per IP+email.
- **Sessions**: 15-minute HS256 access token held in memory only; opaque rotating refresh token in an httpOnly, SameSite cookie; reuse of a rotated token revokes the session family (20 s grace for racing tabs).
- **Admin MFA**: TOTP required for admin roles; secrets encrypted with AES-256-GCM; replay protection via last used time-step; one-time challenge tokens.
- **CSRF**: cookie-authenticated mutations require an allowed `Origin` and an `X-CSRF-Token` header.
- **Transport/headers**: Helmet, strict CORS allow-list, CSP and frame/referrer/permissions headers on the storefront.
- **Abuse limits**: Redis-backed limits on auth, orders, search, assistant and admin reindex; embedding spend cap.
- **Payments**: prices computed server-side from the database; Stripe webhook signature verification on the raw body; idempotent event processing; stock reserved with row locks and released by an expiry job.
- **Uploads**: size limits, magic-byte sniffing, re-encoding via sharp, GLB structure validation, signed URLs for private originals.
- **Secrets**: startup refuses weak, example or reused secrets outside tests.
- **Search**: all SQL parameterised; vector store only suggests IDs, visibility is re-checked in Postgres; Chroma is never exposed publicly.

## Not covered / your responsibility
- TLS termination, WAF/DDoS protection, backups, log retention and alerting.
- A third-party penetration test. This project has been code-reviewed, not pen-tested.
- Dependency updates: CI runs `pnpm audit` on production deps; keep it enabled.

## Reporting
Open a private security advisory on the repository, or email the maintainer.
