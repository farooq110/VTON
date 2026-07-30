# Admin Portal — Backend

Express + TypeScript API server for the Admin Portal. Manages customers, franchises,
FASHN.ai API keys, VTON (virtual try-on) requests, pricing tiers, invoices, and usage
analytics.

## Tech Stack

- **Runtime:** Node.js 20+, TypeScript 5+
- **Framework:** Express 4
- **ORM:** Prisma 6 (SQLite for dev — swap to Postgres by changing the `provider` line in `prisma/schema.prisma`)
- **Validation:** Zod
- **Logging:** Pino (`pino-pretty` in dev, JSON in prod)
- **Cache:** ioredis (with graceful in-memory LRU fallback)
- **Queue:** BullMQ (graceful no-op if Redis unavailable)
- **Auth:** jsonwebtoken + bcryptjs (cookie-based JWT)
- **Security:** helmet, cors, express-rate-limit

## Quick Start

```bash
cd backend
cp .env.example .env          # then edit JWT_SECRET + ENCRYPTION_KEY
npm install
npm run prisma:generate
npm run prisma:push
npm run seed                  # creates admin + demo customers
npm run dev                   # starts on http://localhost:4000
```

Default admin credentials:

- email: `admin@admin-portal.local`
- password: `admin12345`

## Architecture

```
src/
├── config/      # env loading + validation (Zod)
├── lib/         # third-party adapters (prisma, redis, cache, queue, logger,
│                #   jwt, password, crypto, fashn-client) — swappable
├── middleware/  # auth, centralized error handler, validation, rate-limit,
│                #   request logger, 404
├── routes/      # one file per resource, mounted under /api
├── services/    # business logic — never imports third-party libs directly
├── schemas/     # Zod schemas per resource
├── types/       # shared types + Express Request augmentation
└── utils/       # response helpers, pagination, async-handler
```

**Loose coupling principle:** services never import third-party libraries directly.
Every external dependency (Prisma, Redis, BullMQ, JWT, bcrypt, FASHN.ai) is wrapped
in a `lib/` adapter that can be swapped without touching business logic.

## Centralized Error Handling

All sync / async / system errors flow through **one** middleware (`middleware/error.middleware.ts`).
Known business-error prefixes are mapped to HTTP status codes:

| Prefix            | HTTP | Meaning                                  |
| ----------------- | ---- | ---------------------------------------- |
| `NO_API_KEY:`     | 400  | Customer has no active FASHN API key     |
| `NO_CREDITS:`     | 402  | API key credit limit exhausted           |
| `NO_PRICING_TIER:`| 400  | Customer has no pricing tier configured  |
| `FASHN_REJECTED:` | 502  | FASHN.ai rejected the request            |
| `FASHN_ERROR:`    | 502  | FASHN.ai returned an error               |
| `NOT_FOUND:`      | 404  | Resource not found                       |
| `VALIDATION:`     | 422  | Zod validation failed                    |
| `UNAUTHORIZED:`   | 401  | Auth failed                              |
| (other)           | 500  | Unknown / system error                   |

Always use `asyncHandler(fn)` on route handlers so rejected promises reach the
centralized middleware.

## API Surface

All routes mounted under `/api` except `/health`.

- `POST /api/auth/signin`, `POST /api/auth/signout`, `GET /api/auth/me`,
  `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `GET|POST|PUT|DELETE /api/customers`
- `GET|POST /api/customers/:id/api-keys`
- `GET|POST /api/customers/:id/pricing`
- `GET|POST|PUT|DELETE /api/franchises`
- `GET /api/usage`, `GET /api/usage/:customerId`, `POST /api/usage/consume`
- `POST /api/pricing/calculate`, `PUT|DELETE /api/pricing/:id`
- `POST /api/invoices/generate`, `GET /api/invoices/list`, `GET /api/invoices/:id`,
  `POST /api/invoices/:id/send`
- `POST /api/vton/tryon`, `GET /api/vton/list`, `GET /api/vton/status/:id`,
  `GET /api/vton/credits`
- `GET /api/notifications`, `POST /api/notifications/:id/read`,
  `POST /api/notifications/read-all`
- `GET /api/activity/summary`, `GET /api/activity/peaks`
- `GET /health` — DB + Redis connectivity check

## Pricing — Progressive Tiered Billing

`pricing.service.ts` `calculateBilling(totalCredits, tiers, currency, currencyCode)`:

1. Filter to active tiers, sort by `startRange` asc.
2. Find the tier whose `[startRange, endRange]` contains `totalCredits` → charge the
   flat `priceCents`.
3. If usage exceeds the **highest** tier's `endRange` → charge the highest tier's flat
   price + pro-rata overflow: `overflowCredits × priceCents / tierSpan` where
   `tierSpan = endRange - startRange + 1`.
4. Returns `{ lineItems: [...], totals: {...} }` where each `lineItem` has `type: "flat" | "overflow"`.

## VTON — Franchise-First Flow

`vton.service.ts` `submitTryon({ franchiseId, payload })`:

1. Look up franchise → derive `customerId`.
2. Find customer's active API key (non-revoked, non-expired) → else `NO_API_KEY:`.
3. Check credit limit: `usedCredit >= defaultCredit` → `NO_CREDITS:` + create
   `LIMIT_EXCEEDED` notification.
4. Verify customer has at least one pricing tier → else `NO_PRICING_TIER:`.
5. Call FASHN.ai `POST /v1/run` with the decrypted API key.
6. Persist `VtonRequest` row with `status="pending"`.
7. Return `{ id, fashnId, status, message }`.

## License

Private / internal.
