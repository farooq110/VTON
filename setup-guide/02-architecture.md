# 02 — Architecture

## Repository layout

```
VTON/
├── frontend/              ← React + Vite + Electron + Tailwind + shadcn (NO Next.js)
│   ├── src/
│   │   ├── pages/         ← Route-level screens (HomePage, ProductsPage, TryOn*, Settings)
│   │   ├── components/    ← Reusable UI (shadcn primitives + boutique components)
│   │   ├── hooks/         ← Small, single-purpose hooks (useCamera, usePoseDetection, etc.)
│   │   ├── lib/           ← Infra: api-client, store (Zustand), constants, utils
│   │   ├── types/         ← Shared TS interfaces (Brand, Product, User, TryOnSettings)
│   │   ├── App.tsx        ← Root: routes + ErrorBoundary + Toast + route guards
│   │   └── main.tsx       ← Entry point
│   ├── electron/          ← Electron main process + preload script
│   ├── vite.config.ts     ← Vite config (React plugin, path aliases)
│   ├── tailwind.config.ts ← Tailwind tokens (primary/accent, breakpoints up to 85″)
│   └── package.json
│
├── backend/               ← Node + Express + TypeScript + Prisma (MongoDB)
│   ├── src/
│   │   ├── routes/        ← Express routers (auth, brand, products, vton, tryon-track, etc.)
│   │   ├── services/      ← Business logic (one file per domain — SRP)
│   │   ├── schemas/       ← Zod request validation schemas
│   │   ├── middleware/    ← auth, rate-limit, validate, error, not-found, request-logger
│   │   ├── lib/           ← Adapters: prisma, jwt, password (bcrypt), logger, queue, crypto
│   │   ├── config/        ← Env loading + centralized config object
│   │   ├── utils/         ← response helpers, pagination, async-handler
│   │   ├── app.ts         ← Express app factory (middleware chain + route mounting)
│   │   ├── index.ts       ← Server bootstrap
│   │   └── seed.ts        ← DB seed script
│   ├── prisma/schema.prisma  ← DB models (Admin, Brand, Product, TryOnLog, Customer, etc.)
│   └── package.json
│
├── admin-portal/          ← Separate React + Vite dashboard for franchise managers
│   └── src/
│       ├── client/        ← Admin UI (pages, components, hooks)
│       └── server/        ← Admin-specific server-side helpers
│
└── setup-guide/           ← This documentation folder
```

## Frontend architecture

### Routing & guards (`src/App.tsx`)

Single `<Routes>` tree with **mutual-exclusion** route guards:

```tsx
<Route path="/signin" element={isAuthed ? <Navigate to="/home" /> : <SignInPage />} />
<Route path="/home"   element={isAuthed ? <HomePage /> : <Navigate to="/signin" />} />
```

This enforces the spec's:
- *"Don't access unauthorized user to private page"* — unauthed → /signin
- *"Don't accept the authorized user to auth page"* — authed on /signin → /home

Hydration-safe: a `_hydrated` flag from Zustand-persist prevents a brief
`/signin` flash before the persisted token rehydrates.

### State management

| Concern | Tool | Why |
|---------|------|-----|
| Server state (API responses) | TanStack Query | Built-in cache, retry, stale-while-revalidate |
| Client state (auth, settings, captures) | Zustand + persist middleware | Tiny (1 KB), no boilerplate, localStorage persistence |
| Form state | React `useState` | The only forms (sign-in, settings) are simple enough |

Single source of truth: `useAuthStore` in `src/lib/store.ts`. All async I/O
(camera, models, network) is delegated to dedicated hooks — the store only
holds plain data.

### Hook decomposition (SRP)

Each hook has ONE job and is independently testable / swappable:

| Hook | Responsibility | Spec reference |
|------|---------------|----------------|
| `useAuth` | 2-step sign-in (sendPasscode → verifyPasscode) | Sign In Process |
| `useCamera` | getUserMedia + captureStill + cleanup | TRY ON Logic step 1 |
| `usePoseDetection` | Load Xenova/yolov8n-pose, detect persons, check pose | Stages 1 + 3 |
| `useImageCompression` | browser-image-compression pipeline (metadata → quality → dimensions) | Stage 2 |
| `useTryOnOrchestrator` | Sequences stages 1 → 2 → 3 → AI call → brand tracking | Full TRY ON flow |
| `useTaglineRotation` | Cycles random taglines on an interval | Animated taglines |
| `useProducts` | TanStack Query for /brand + /products, with dummy fallback | Home + Product screens |
| `useHiddenLogout` | Long-press brand logo → sign out | Kiosk hidden logout |
| `useBodyScrollLock` | Locks body scroll when a modal/preview is open | UX polish |
| `useMobile` | Detects viewport for responsive conditionals | Responsive design |

### Component decomposition

```
components/
├── ui/                    ← shadcn primitives (button, input, dialog, etc.)
├── auth/RouteGuard.tsx    ← Optional wrapper for declarative route protection
├── home/TrendingProducts  ← Infinite-scroll rail (IntersectionObserver)
├── products/
│   ├── ProductCard        ← Single garment tile (3 variants: compact, expand, modal)
│   ├── ProductTryOnModal  ← Quick-try-on modal from the products page
│   └── FiltersModal       ← Size/color/price filters
├── tryon/
│   ├── AddCapturePanel    ← Upload-by-URL or file picker for saved captures
│   └── ActivityLogPanel   ← Debug overlay (gated by settings.debugLogging)
├── settings/
│   ├── BrandSection       ← Manager-only: cover image, name, logo upload
│   └── ThemeSection       ← Manager-only: colors, font, base font size
└── layout/
    ├── GlobalHeader       ← Standard page header with back button
    ├── BrandHeader        ← Boutique-flavored header (logo + tagline)
    └── Avatar             ← User avatar with role badge
```

### TRY ON pipeline (`useTryOnOrchestrator`)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────┐    ┌──────────────┐
│   capture   │ -> │   Stage 1   │ -> │   Stage 2   │ -> │ Stage 3 │ -> │   AI call    │
│ (useCamera) │    │  person det │    │ compression │    │ pose chk│    │ (fetch POST) │
└─────────────┘    │ (yolov8n)   │    │ (browser-   │    │ (reuse  │    └──────┬───────┘
                   └─────────────┘    │  image-comp)│    │  S1 kps)│           │
                                      └─────────────┘    └─────────┘           │
                                                                                ▼
                                                                          ┌──────────────┐
                                                                          │ brand track  │
                                                                          │ POST /tryon/ │
                                                                          │   track      │
                                                                          └──────────────┘
```

- **Stage 1** runs `Xenova/yolov8n-pose` via `@xenova/transformers`. Returns
  `kind: 'ok' | 'no-person' | 'multi-person'` with a `score` (default ≥ 0.6).
- **Stage 2** strips metadata first, then reduces quality in 0.05 steps until
  quality hits 0.70, then reduces dimensions 5% per cycle until ≤ 1000 KB.
- **Stage 3** reuses Stage 1's keypoints (halves inference time) to check
  shoulder tilt, face yaw, face pitch, body visibility.
- **AI call** posts to `settings.tryOnApiEndpoint` (FASHN.ai in production,
  any compatible TryOn API otherwise). Falls back to the captured image on
  failure so the flow always completes.
- **Brand tracking** is fire-and-forget — never blocks the UI.

### Electron integration

`electron/main.ts` creates a BrowserWindow pointing at the Vite dev server
(dev) or the built `dist/index.html` (prod). `electron/preload.ts` exposes a
minimal `nova` API to the renderer for filesystem access (saved captures
gallery) — not used yet, but the bridge is in place.

## Backend architecture

### Layered structure (Dependency Inversion)

```
routes  ─────►  services  ─────►  lib (prisma, jwt, password, queue, crypto)
   │              │
   │              └──►  schemas (Zod validation)
   │
   └──►  middleware (auth, rate-limit, validate, error, not-found, request-logger)
```

- **Routes** only handle HTTP concerns: parse request, call service, send response.
- **Services** contain all business logic + DB access. They never touch `req`/`res`.
- **Lib adapters** wrap third-party packages (bcrypt → `lib/password.ts`,
  jsonwebtoken → `lib/jwt.ts`, BullMQ → `lib/queue.ts`). Swap a library →
  edit one adapter, no service changes.

### Request lifecycle

```
HTTP request
  │
  ▼
helmet()                  ← security headers
cors()                    ← CORS origin check
express.json()            ← body parse (1 MB limit)
cookieParser()            ← parse cookies (auth token)
requestLogger             ← pino-http structured log
globalRateLimit           ← 100 req/min per IP
  │
  ▼
/api/{module}/*           ← route-specific middleware (auth, validate) → handler
  │
  ▼
asyncHandler              ← catches async errors, forwards to errorHandler
  │
  ▼
errorHandler              ← centralized: Zod → 422, prefix-mapped → status, fallback → 500
```

### Error contract

Every thrown error message follows the convention `<PREFIX>: <detail>`:

| Prefix | HTTP | Code |
|--------|------|------|
| `UNAUTHORIZED:` | 401 | UNAUTHORIZED |
| `FORBIDDEN:` | 403 | FORBIDDEN |
| `NOT_FOUND:` | 404 | NOT_FOUND |
| `CONFLICT:` | 409 | CONFLICT |
| `VALIDATION:` | 422 | VALIDATION |
| `NO_API_KEY:` | 400 | NO_API_KEY |
| `NO_CREDITS:` | 402 | NO_CREDITS |
| `NO_PRICING_TIER:` | 400 | NO_PRICING_TIER |
| `FASHN_REJECTED:` | 502 | FASHN_REJECTED |
| `FASHN_ERROR:` | 502 | FASHN_ERROR |

This means services can `throw new Error('NOT_FOUND: Franchise not found')`
and the error middleware maps it to a 404 automatically.

### Response shape

Every response (success or error) follows the same envelope:

```typescript
// Success
{ success: true,  data: T,                       message?: string }

// Error
{ success: false, error: { code, message },       message?: string }
```

### Prisma schema (MongoDB)

```
Admin           ← email + password + role + passcode (2-step signin)
Brand           ← storefront identity (cover, logo, name, tagline)
Product         ← garment catalog (sku, name, price, sizes, colors, trendingScore)
TryOnLog        ← per-brand + per-franchise try-on request log
Customer        ← admin portal customer (B2B)
Franchise       ← customer's location
ApiKey          ← FASHN.ai API key (encrypted)
VtonRequest     ← FASHN.ai submission record
Usage           ← per-day credit usage
Invoice         ← monthly billing
CustomerPricing ← progressive pricing tiers
Notification    ← in-app notifications
ActivityLog     ← server-side request log
```

## Loose-coupling guarantees

| Swap target | What to change | Files affected |
|-------------|---------------|----------------|
| Pose detection model | Add a new entry to `MODEL_REPO` in `usePoseDetection.ts` | 1 file |
| Image compression lib | Rewrite `useImageCompression.ts` (interface stays the same) | 1 file |
| TryOn AI provider | Update `settings.tryOnApiEndpoint` in the Settings UI | 0 code changes |
| DB ORM (Prisma → Mongoose) | Rewrite service layer; routes + schemas unchanged | ~10 service files |
| Auth (JWT → session) | Rewrite `lib/jwt.ts` + `middleware/auth.middleware.ts` | 2 files |
| Email provider | Rewrite `lib/queue.ts` `enqueueEmail()` | 1 file |
| State management (Zustand → Redux) | Rewrite `lib/store.ts` (interface stays the same) | 1 file + 0 component changes |
| UI primitives (shadcn → MUI) | Replace `components/ui/*` | ~14 files, 0 logic changes |

## SOLID principles applied

- **S**ingle Responsibility: each hook / service / route file has one job
- **O**pen-closed: extend `MODEL_REPO` map to add models — don't edit `usePoseDetection`
- **L**iskov: `useImageCompression` interface stays identical even if the lib swaps
- **I**nterface segregation: small focused hooks (useCamera, usePoseDetection) — no god-hook
- **D**ependency inversion: services depend on lib adapters, not on concrete packages
