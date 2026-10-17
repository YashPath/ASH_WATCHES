# Deploying ASH_

Recommended: one small VPS (2 GB RAM+) running everything with Docker Compose and Caddy for automatic HTTPS.
Cost is a few dollars a month. You provide the server, a domain, SMTP credentials and Stripe keys.

## 1. Server and DNS
1. Create an Ubuntu 22.04/24.04 VPS. Install Docker: `curl -fsSL https://get.docker.com | sh`.
2. Point an `A` record for your domain (e.g. `shop.example.com`) at the server IP. Open ports 80 and 443 only.

## 2. Configure
```bash
git clone <your repo> ash && cd ash
cp .env.example .env
```
Edit `.env`:
- `DOMAIN=shop.example.com`, `ACME_EMAIL=you@example.com`
- `FRONTEND_ORIGIN=https://shop.example.com` (must match exactly: it is the CSRF/CORS origin)
- `POSTGRES_PASSWORD`, and every secret in `.env.example` set to long random values (`openssl rand -base64 48`)
- SMTP settings (verification, reset and admin-MFA emails depend on it)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (step 5)
- `NODE_ENV=production` is set by the compose file.

## 3. Start
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## 4. Database schema
The repo has no baseline migration yet. For a fresh database either:
- quick: `docker compose exec api npx prisma db push`
- or generate a baseline once with `scripts/make-baseline.sh` (see `prisma/BASELINE.md`), commit it, then use `npx prisma migrate deploy` from then on.

Optional demo data: `docker compose exec api pnpm seed:demo` (do not run this on a real store).

## 5. Stripe
In the Stripe dashboard add a webhook endpoint `https://DOMAIN/api/v1/payments/webhook` with events
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded`. Put the signing secret in `STRIPE_WEBHOOK_SECRET`, then
`docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d api`.
Test with Stripe test keys and card 4242 4242 4242 4242 before going live. Checkout-session creation has not been exercised against the live Stripe API in development, so do this test.

## 6. First admin
```bash
docker compose exec -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='a-long-passphrase' api pnpm create:admin
```
Sign in at `/login`. Admins must enroll an authenticator app: follow the emailed link (`/admin-mfa-enroll`). Then open `/admin`.

## 7. Operations
- Backups: `docker compose exec postgres pg_dump -U ash ash | gzip > backup-$(date +%F).sql.gz` on a cron; copy offsite.
- Updates: `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`.
- Search index: `docker compose exec api pnpm search:reindex`.
- Logs: `docker compose logs -f api`.

## Alternative: Vercel (web) + Render/Railway (API)
Possible but with caveats. The browser must see web and API on the same site, since the refresh cookie and CSRF check assume it:
- Serve both under one domain (e.g. `app.example.com` and `api.example.com` with cookie domain set to the parent) or put a reverse proxy in front.
- Next `rewrites` need `API_INTERNAL_URL` set to the API's public URL; then the API sees Vercel's IP, so rate limiting is weaker (`trust proxy` must be adjusted).
- You need managed Postgres, Redis and a Chroma host (or set `SEARCH_ENABLED=false`).
The single-VPS setup above avoids all of this and is the supported path.
