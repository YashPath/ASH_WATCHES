# Showing the site to a client

This project is a **demo store**: use it to show a client what their own shop could look like, not as a finished live shop.

## Run it locally

```bash
cp .env.example .env   # fill the CHANGE_ME values
pnpm install
docker run -d -p 5432:5432 -e POSTGRES_USER=ash -e POSTGRES_PASSWORD=ash_dev_password -e POSTGRES_DB=ash_watch postgres:16-alpine
docker run -d -p 6379:6379 redis:7-alpine
pnpm exec prisma db push
pnpm --filter @ash/api seed:demo
pnpm api:dev                      # terminal 1
pnpm --filter @ash/web dev        # terminal 2  → http://localhost:3000
```

Demo customer: `demo@ash.test` / `Demo-Customer-2026!`. Create an admin with `ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter @ash/api create:admin` (admins must enrol an authenticator app on first sign-in).

## Suggested 5-minute walkthrough

1. Home page and hero.
2. Open a watch, drag to rotate, **scroll to zoom in** so the parts separate, zoom out to reassemble. Try a diver, a chronograph and the skeleton for different styles.
3. Type a natural-language search ("blue dial under 30000").
4. Sign in, add to cart, check out with **Cash on delivery** (no payment keys needed).
5. Admin: dashboard numbers, mark the order shipped and delivered, edit a product.

## Tips
- Use a laptop with a real GPU; software rendering makes the 3D laggy.
- Online card payment needs Stripe test keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), so use COD in demos without them.
- Being upfront about what is demo content (products, photos, policy text) builds trust.
