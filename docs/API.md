# API reference

Base path `/api/v1`. All write requests need `Origin` = `FRONTEND_ORIGIN` and an `X-CSRF-Token` header (16+ chars). Authenticated routes use `Authorization: Bearer <access token>`; the refresh token is an httpOnly cookie. Machine-readable summary: `GET /openapi.json`. Errors look like `{ "error": { "code": "...", "message": "..." } }`.

## Public
| Method | Path | Notes |
|---|---|---|
| GET | `/products` | Filters: `gender`, `movement`, `minPrice`, `maxPrice`, `q`, pagination |
| GET | `/products/:slug` | Detail with variants and images |
| GET | `/products/:slug/similar` | Similar products |
| GET | `/search` | Natural-language hybrid search |
| GET | `/search/suggest` | Header suggestions |

## Auth
`POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/password-reset/request`, `/auth/password-reset/confirm`, MFA: `/auth/mfa/challenge`, `/auth/mfa/enroll/initial`, `/auth/mfa/confirm-initial`, `/auth/mfa/enroll`, `/auth/mfa/confirm`.

## Customer (login required; checkout needs a verified email)
| Method | Path | Notes |
|---|---|---|
| GET/POST/PATCH/DELETE | `/cart`, `/cart/items`, `/cart/items/:id` | Totals computed on the server |
| GET/POST/PUT/DELETE | `/addresses` | Shipping addresses |
| POST | `/orders` | Creates an order from the cart, reserves stock |
| GET | `/orders`, `/orders/:id` | Own orders only (others return 404) |
| POST | `/orders/:id/cancel` | Pending orders only, restocks |
| POST | `/orders/:id/cod` | Confirm cash on delivery |
| POST | `/payments/checkout-session` | Stripe Checkout URL; `503 PAYMENTS_UNAVAILABLE` if Stripe is not configured |
| POST | `/payments/webhook` | Stripe signed webhook (raw body) |
| GET/POST/DELETE | `/wishlist`, `/wishlist/:productId` | |
| POST | `/reviews` | Only for purchased products; moderated before display |

## Admin (ADMIN or SUPER_ADMIN, MFA-verified token)
Catalogue: `GET /admin/catalog`, `POST /admin/brands`, `POST /admin/categories`, `GET/POST /admin/products`, `PATCH/DELETE /admin/products/:id`, `POST /admin/products/:id/variants`, `PATCH/DELETE /admin/variants/:id`, `PATCH /admin/variants/:id/inventory`.
Media: `POST /admin/uploads/image`, `POST /admin/uploads/model`, `POST /admin/products/:id/images/attach`, `POST /admin/products/:id/models/attach`.
Operations: `GET /admin/orders`, `PATCH /admin/orders/:id/status` (allowed: `PAID→SHIPPED`, `SHIPPED→DELIVERED`, `PENDING→CANCELLED`, and for COD also `PENDING→SHIPPED`), `GET /admin/analytics` (30-day revenue, top products, orders per day), `GET /admin/reviews`, `PATCH /admin/reviews/:id/moderate`, `GET /admin/users`, `PATCH /admin/users/:id/role` (super admin only).
Search: `GET /admin/search/status`, `POST /admin/search/reindex`.

## Other
`GET /health`, `GET /ready`, `GET /media-public/*` (public derivatives), `GET /api/v1/media/:id/download` (signed private files).
