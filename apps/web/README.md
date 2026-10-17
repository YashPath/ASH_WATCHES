# @ash/web — storefront

Next.js 15 (App Router, React 19), React Three Fiber, Tailwind. Talks to the API through same-origin rewrites (`/api/v1`, `/media-public`; target set by `API_INTERNAL_URL`, default `http://localhost:4000`).

```bash
pnpm --filter @ash/web dev        # http://localhost:3000
pnpm --filter @ash/web build      # standalone output in .next/standalone
pnpm --filter @ash/web typecheck
pnpm --filter @ash/web test       # unit
pnpm --filter @ash/web e2e        # Playwright, needs running API + seeded DB
```

| Folder | Contents |
|---|---|
| `app/` | Routes: `shop`, `product/[slug]`, `cart`, `checkout`, `account`, `wishlist`, `admin`, `legal/[slug]`, `contact`, auth flows |
| `components/ProceduralWatch.tsx` | The 3D watch and exploded view, see `../../docs/3D-WATCH.md` |
| `components/admin/` | Admin product form, orders, reviews, stats |
| `lib/api.ts` | Fetch wrapper: bearer token, silent refresh, CSRF header |
| `lib/policies.ts` | Policy page text (template, owner must review) |
| `e2e/` | Playwright tests |

Optional env: `NEXT_PUBLIC_CONTACT_EMAIL` (shown on the contact page). Security headers and the strict CSP live in `next.config.mjs`; uploaded media URLs must be relative or the CSP blocks them.
