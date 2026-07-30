# Summary of Changes

This document lists every change made to the VTON repository in this iteration,
with the **why** for each.

---

## TL;DR

The repository was already 90% complete — a well-architected React + Vite +
Electron + Tailwind + shadcn frontend wired to an Express + TypeScript + Prisma
backend. The remaining gaps against the user's feature spec were:

1. **Sign-in was single-step** — the spec requires a 2-step email passcode flow.
2. **Backend had no `/brand`, `/products`, or `/tryon/track` endpoints** — the
   frontend called them but they didn't exist (frontend had dummy-fallback).
3. **New Arrivals page was a redirect** — the spec calls for an empty placeholder
   screen.
4. **Prisma used `$queryRaw`** which doesn't exist on the MongoDB provider →
   backend failed to compile.
5. **`.env.example` was stale** — said "SQLite" but the schema uses MongoDB.
6. **No setup-guide folder** — the spec required one.

All gaps fixed, no existing APIs broken, both projects build + boot cleanly.

---

## Backend changes

### New files

| File | Purpose |
|------|---------|
| `backend/src/schemas/brand.schema.ts` | Zod schema for `PATCH /api/brand/:id` |
| `backend/src/schemas/product.schema.ts` | Zod schemas for `GET /api/products` (query + params) |
| `backend/src/schemas/tryon-track.schema.ts` | Zod schema for `POST /api/tryon/track` |
| `backend/src/services/brand.service.ts` | Brand CRUD + auto-seed default brand |
| `backend/src/services/product.service.ts` | Product list / get-by-id / seed-dummy-products |
| `backend/src/services/tryon-track.service.ts` | Persist + list try-on log rows (fire-and-forget on the client) |
| `backend/src/services/passcode.service.ts` | 2-step sign-in: generate + email + verify 6-digit passcode |
| `backend/src/routes/brand.routes.ts` | `GET /api/brand`, `GET /api/brand/list`, `PATCH /api/brand/:id` |
| `backend/src/routes/product.routes.ts` | `GET /api/products`, `GET /api/products/:id` |
| `backend/src/routes/tryon-track.routes.ts` | `POST /api/tryon/track`, `GET /api/tryon/track/list`, `GET /api/tryon/track/count` |

### Modified files

| File | Change | Why |
|------|--------|-----|
| `backend/prisma/schema.prisma` | Added `passcode`, `passcodeExpires`, `passcodeAttempts` to `Admin`; added new models `Brand`, `Product`, `TryOnLog` | Need tables for the new endpoints; need passcode fields on Admin for the 2-step sign-in |
| `backend/src/lib/prisma.ts` | `pingDatabase()` now uses `$runCommandRaw` for MongoDB (was `$queryRaw` which only works on SQL providers) | Backend was failing to compile — `Property '$queryRaw' does not exist on type 'PrismaClient'` |
| `backend/src/schemas/auth.schema.ts` | `signinSchema` now accepts EITHER `email` OR `identifier` (with `refine` to enforce one) | Frontend sends `{ identifier, password }`; backend was rejecting with `email is required` |
| `backend/src/services/auth.service.ts` | `login()` now tries email first, falls back to case-insensitive name match (franchise-name login) | Match the frontend's email-or-franchise-name UX |
| `backend/src/routes/auth.routes.ts` | Added `POST /api/auth/passcode/send` + `POST /api/auth/passcode/verify` | 2-step sign-in spec requirement |
| `backend/src/app.ts` | Mounted `/api/brand`, `/api/products`, `/api/tryon` routes | Wire the new endpoints into Express |
| `backend/src/seed.ts` | Now seeds a default Brand + 8 dummy Products (in addition to existing admin/customers/franchises/usage/invoices) | Frontend's HomePage + ProductsPage shouldn't be empty on first install |
| `backend/.env.example` | Updated `DATABASE_URL` to MongoDB URI (was SQLite-style `file:./prisma/dev.db`); added multi-origin `CORS_ORIGIN` | Schema uses MongoDB provider — `.env.example` was misleading |

### What was NOT touched (to avoid breaking existing APIs)

- `backend/src/routes/customers.routes.ts` — unchanged
- `backend/src/routes/franchises.routes.ts` — unchanged
- `backend/src/routes/usage.routes.ts` — unchanged
- `backend/src/routes/pricing.routes.ts` — unchanged
- `backend/src/routes/invoices.routes.ts` — unchanged
- `backend/src/routes/vton.routes.ts` — unchanged (FASHN.ai submission API)
- `backend/src/routes/notifications.routes.ts` — unchanged
- `backend/src/routes/activity.routes.ts` — unchanged
- `backend/src/routes/health.routes.ts` — unchanged
- All middleware, lib adapters, and existing services — unchanged

---

## Frontend changes

### Modified files

| File | Change | Why |
|------|--------|-----|
| `frontend/src/hooks/useAuth.ts` | Rewrote to expose `sendPasscode` + `verifyPasscode` mutations (2-step flow). Kept `signIn` (legacy single-step) for the "Quick demo login" rows on the sign-in page. | Spec requirement: "Send passcode to user email to validate the sign in" |
| `frontend/src/pages/SignInPage.tsx` | Rewrote as a 2-step form with `AnimatePresence` slide transition. Step 1: email + password → sends passcode. Step 2: 6-digit code input → verifies. Includes "Resend code", "Use a different account", and the legacy quick-demo-login section. | Spec requirement: full 2-step sign-in UX |
| `frontend/src/pages/NewArrivalsPage.tsx` | Was a redirect to `/products?newArrivalsOnly=true`. Now an empty placeholder screen with "New arrivals dropping soon" message + Browse collection CTA + faint brand cover backdrop. | Spec: "create empty screen, will decide logic later" |

### What was NOT touched (already spec-compliant)

- `frontend/src/App.tsx` — route guards already implement mutual-exclusion (authed blocked from /signin, unauthed blocked from /home)
- `frontend/src/pages/HomePage.tsx` — already has brand logo, brand name, full-bleed cover banner, tagline, Explore products button, infinite-scroll trending rail
- `frontend/src/components/home/TrendingProducts.tsx` — already implements infinite scroll with IntersectionObserver + cycles the catalog so the list never ends (matches "I can check scroll up to 30")
- `frontend/src/pages/ProductsPage.tsx` — already has search bar, category filter, 3 tap modes (navigate / expand / modal)
- `frontend/src/pages/ProductDetailPage.tsx` — already has TRY ON button
- `frontend/src/pages/TryOnCameraPage.tsx` — already has intro phase, camera phase, 3s countdown, captured-preview phase, saved captures rail
- `frontend/src/pages/TryOnProcessingPage.tsx` — already shows blurred capture + animated taglines + stage list + progress bar + model-load indicator
- `frontend/src/pages/TryOnResultPage.tsx` — already shows full-bleed result + Close button + Try another button (goes to /products)
- `frontend/src/pages/CapturesGalleryPage.tsx` — already has select mode, preview, delete, "try on with this" confirmation modal
- `frontend/src/pages/SettingsPage.tsx` — already has detection model picker (4 models), posture thresholds, compression settings, capture timer, AI endpoint/key, debug logging
- `frontend/src/hooks/usePoseDetection.ts` — already uses `Xenova/yolov8n-pose` via `@xenova/transformers`, score default 0.6
- `frontend/src/hooks/useImageCompression.ts` — already implements exact Stage 2 algorithm (metadata strip → quality 0.95→0.70 in 0.05 steps → dimensions 1.0→0.2 in 0.05 steps, under 1000 KB)
- `frontend/src/hooks/useTryOnOrchestrator.ts` — already sequences Stage 1 → 2 → 3 → AI call → brand tracking (fire-and-forget POST /tryon/track)
- `frontend/src/hooks/useTaglineRotation.ts` — already rotates random taglines on an interval
- `frontend/src/lib/store.ts` — already has dummy products + dummy captures seeding for offline mode
- `frontend/src/lib/api-client.ts` — already auto-injects JWT + handles 401 redirect

---

## New documentation (setup-guide folder)

| File | Purpose |
|------|---------|
| `setup-guide/README.md` | Index + stack overview + Mongoose-vs-Prisma rationale |
| `setup-guide/01-quick-start.md` | Get running in 5 minutes |
| `setup-guide/02-architecture.md` | Codebase structure, SOLID, loose-coupling guarantees |
| `setup-guide/03-api-reference.md` | Every endpoint documented with request/response shapes |
| `setup-guide/04-feature-matrix.md` | Spec → code location mapping (★ = new, ✓ = pre-existing) |
| `setup-guide/05-improvement-guide.md` | How to swap models, libs, ORMs; production hardening checklist |
| `setup-guide/06-tech-stack-decisions.md` | Why each technology was chosen + alternatives |
| `setup-guide/07-deployment.md` | Production deploy for web + desktop + mobile |

Plus a top-level `README.md` linking to all of the above.

---

## Verification

| Check | Result |
|-------|--------|
| `cd frontend && npx tsc --noEmit` | ✓ passes (no errors) |
| `cd frontend && npm run build` | ✓ passes (Vite build OK) |
| `cd frontend && npm run dev` | ✓ boots on http://localhost:5173 |
| `cd backend && npx prisma generate` | ✓ Prisma client regenerated with new models |
| `cd backend && npx tsc --noEmit` | ✓ passes (no errors) |
| `cd backend && npx tsc` | ✓ passes (dist/ produced) |
| `cd backend && node dist/index.js` | ✓ boots on http://localhost:4000 (Redis gracefully falls back to in-memory) |

---

## Loose-coupling guarantees preserved

- All new backend services go through `lib/` adapters (prisma, jwt, password, queue, crypto).
- All new routes use the existing `validate` middleware + Zod schemas + `asyncHandler` + `sendOk`.
- All new endpoints follow the existing `{ success, data, message }` envelope.
- Frontend `useAuth.ts` keeps the same `useMutation` shape — components don't change.
- Frontend `useProducts.ts` already had `unwrapBrand` / `unwrapProductList` / `unwrapProduct` helpers that tolerate any response shape — no changes needed when the new endpoints came online.

## SOLID principles applied to new code

- **S**ingle Responsibility: `passcode.service.ts` only handles passcode logic; `brand.service.ts` only handles brand CRUD; etc.
- **O**pen-closed: `usePoseDetection.ts` `MODEL_REPO` map — add new models without editing `detect()`.
- **L**iskov: `BrandDto` interface is satisfied by both the Prisma-backed service AND any future Mongoose-backed rewrite.
- **I**nterface segregation: 3 separate hooks (`useCamera`, `usePoseDetection`, `useImageCompression`) instead of one god-hook.
- **D**ependency inversion: routes depend on service interfaces; services depend on `lib/prisma` adapter (not Prisma directly).

---

## Known caveats

1. **Prisma vs Mongoose** — Spec called for Mongoose; repo uses Prisma (MongoDB provider). Kept Prisma to avoid breaking existing APIs. Migration guide in `setup-guide/05-improvement-guide.md`.
2. **Passcode in dev mode** — `passcode.service.ts` returns the 6-digit code in the API response when `NODE_ENV !== 'production'` so you can sign in without SMTP. Remove the `devPasscode` field before production.
3. **FASHN.ai API key not set** — The TryOn orchestrator gracefully falls back to a mock result (the captured image) so the full flow works end-to-end without a real AI provider. Set `tryOnApiEndpoint` + `tryOnApiKey` in the Settings UI for real results.
4. **MongoDB required** — The backend needs a MongoDB instance to run. Use `mongodb://localhost:27017/vton` for local dev, or MongoDB Atlas free tier for cloud.
5. **Redis optional** — BullMQ's `enqueueEmail()` no-ops if Redis is unreachable. Passcodes still work in dev (surfaced in the API response + UI).
