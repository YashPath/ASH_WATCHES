# Raw SQL / Prisma type evidence

| SQL expression or column | Prisma declaration | PostgreSQL type |
|---|---|---|
| `v."id" = ${item.variantId}::uuid` | `ProductVariant.id String @db.Uuid` | `uuid` |
| `v."productId"` | `ProductVariant.productId String @db.Uuid` | `uuid` |
| `"User"."id" = ${userId}::uuid` | `User.id String @db.Uuid` | `uuid` |
| `v."stockQuantity"` | `ProductVariant.stockQuantity Int @default(0)` | `integer` |
| `v."price"` | `ProductVariant.price Int` | `integer` |
| `v."sku"` | `ProductVariant.sku String @db.VarChar(100)` | `character varying(100)` |
| `Order.manualReviewRequired` | `Order.manualReviewRequired Boolean @default(false)` | `boolean` |
| `Order.checkoutStartedAt` | `Order.checkoutStartedAt DateTime?` | `timestamp(3)` |
| `User.lastTotpTimeStep` | `User.lastTotpTimeStep BigInt?` | `bigint` |
| `ProcessedStripeEvent.id` | `String @id @default(uuid()) @db.Uuid` | `uuid` |
| `EmailActionToken.userId` | `String @db.Uuid` | `uuid` |
| `MediaAsset.sizeBytes` | `Int` | `integer` |

## Evidence in source

`apps/api/src/modules/orders/orders.routes.ts` binds variant identifiers and casts them with `::uuid`; `User.id` is also cast to `uuid` when taking a per-user row lock. The `stockQuantity` and `price` columns are selected as PostgreSQL `integer` and represented as TypeScript `number`, consistent with Prisma `Int`. Monetary fields are not `BIGINT` or floating-point values. `lastTotpTimeStep` is intentionally Prisma `BigInt?`, which maps to PostgreSQL `bigint`; it is a time-step counter, not money or inventory. The migration uses `UUID`, `INTEGER`, `BIGINT`, and `TIMESTAMP(3)` consistent with these declarations.
