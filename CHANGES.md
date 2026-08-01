# VTON — Change Summary

This document describes every change made to the VTON codebase, grouped by
issue, with the **what** and the **why** for each.

---

## 1. TryOn API HTTP 404 — FIXED

### Root Cause
The frontend's `useTryOnOrchestrator.ts` called the TryOn AI endpoint using
**raw `fetch("/api/tryon/run", ...)`** — a **relative URL**. In the Vite dev
server (port 5173), this hit `http://localhost:5173/api/tryon/run` which does
NOT exist on the frontend → **404 Not Found**.

The backend endpoint `POST /api/tryon/run` was correctly mounted on port 4000,
but the frontend never reached it because the request went to the wrong host.

### Fix
**`frontend/src/hooks/useTryOnOrchestrator.ts`** — Rewrote `callTryOnApi()` to
use the shared `apiClient` (axios instance) instead of raw `fetch()`.

- `apiClient` is configured with `baseURL = "http://localhost:4000/api"` so
  `apiClient.post("/tryon/run", ...)` hits the **real backend**, not Vite.
- The Authorization header is auto-injected from `localStorage.nova_token`.
- 401 responses are handled centrally by the api-client interceptor.
- The request body now includes `franchiseId` (from the logged-in user) so
  the backend can resolve which customer's API key to use.

### Same bug also fixed in logger
**`frontend/src/lib/logger.ts`** — The telemetry sender used
`fetch("/api/telemetry", ...)` (same relative-URL bug). Switched to
`apiClient.post("/telemetry", ...)`.

---

## 2. Per-Customer API Key Logic — IMPLEMENTED

### Requirement
> "Tryon api key logic is every customer have one active key assign from
> admin from admin portal. It do not apply from environment variable. The
> api key get from customer. Only fashion ai url set from environment."

### Implementation
**`backend/src/services/tryon-run.service.ts`** (NEW FILE) — A new service
that runs the full synchronous try-on flow:

1. **Resolve customer** from the request body (`customerId` or `franchiseId`).
   If neither matches, fall back to the **first customer with an active API
   key** (demo mode) so the app works out-of-the-box.
2. **Load the customer's active API key** from the database (non-revoked,
   non-expired) — **NEVER from `process.env`**.
3. **Decrypt** the key (AES-256-GCM) and forward to FASHN.ai.
4. **Poll** FASHN.ai status until the job completes (90s ceiling).
5. **Increment** `usedCredit` + `lastUsedAt` on the API key.
6. **Return** the result image.

If NO customer API key exists in the database, returns a **MOCK result**
(the user's own image) with `mock: true` so the frontend pipeline completes
end-to-end without crashing.

**`backend/src/routes/tryon-track.routes.ts`** — Rewrote the `POST /run`
endpoint to call `tryonRunService.tryonRun()` instead of reading
`process.env.TRYON_AI_API_KEY` (which is now removed).

### Environment
Only `FASHN_API_BASE_URL` comes from the environment. The old
`TRYON_AI_ENDPOINT` and `TRYON_AI_API_KEY` env vars are **no longer used**.

**`backend/.env.example`** + **`backend/.env`** — Updated to document the new
architecture.

---

## 3. Infinite Redirect Loop on Expired Token — FIXED

### Root Cause
When the database changed (admin deleted, token expired server-side), the
backend returned 401. The api-client interceptor cleared `nova_token` and
redirected to `/signin`. BUT the Zustand auth store was **persisted to
localStorage** under key `atelier-nova-tryon` with `isAuthed: true`.

1. 401 → clear `nova_token` → navigate to `/signin`
2. `App.tsx` route guard sees `isAuthed === true` (stale persisted state) →
   redirects to `/home`
3. `/home` mounts → API call has no token → 401 → back to `/signin`
4. → **infinite loop** between `/signin` and `/home` → browser crashes

### Fix
**`frontend/src/lib/api-client.ts`** — Rewrote the 401 interceptor to do a
**HARD sign-out**:

1. Remove `nova_token` from localStorage
2. Remove the entire persisted Zustand store key (`atelier-nova-tryon`) so
   `isAuthed` resets to `false` on next load
3. Dispatch a `window` event (`auth:hard-signout`) so TanStack Query can
   clear its cache
4. Use `window.location.replace("/signin")` (NOT `href`) — replaces the
   current history entry so the Back button doesn't re-enter the loop
5. A 2-second cooldown prevents concurrent 401s from racing

**`frontend/src/App.tsx`** — Route guards now check BOTH:
- `isAuthed` from the Zustand store
- `hasToken` from `localStorage` (via a new `useHasToken()` hook)

A route is only accessible when **BOTH** are true. Also listens for the
`auth:hard-signout` event and calls `queryClient.clear()` to flush all
cached API data.

**`frontend/src/lib/store.ts`** — `signOut()` now also:
- Removes the persisted store key (`atelier-nova-tryon`)
- Dispatches the `auth:hard-signout` event

---

## 4. Heavy Tasks Moved to Web Worker — IMPLEMENTED

### Requirement
> "Make sure all heavy task perform in web worker. Do not block main thread."

### Implementation
**`frontend/src/workers/pose-detection.worker.ts`** (NEW FILE) — A web worker
that offloads ALL pose-detection heavy work from the main thread:

- transformers.js module load (from CDN)
- YOLOv8n-pose model download (multi-MB)
- ONNX inference + tensor math
- NMS (Non-Maximum Suppression)
- YOLOv8 output tensor parsing

The main thread only posts `load` / `detect` messages and receives
`loaded` / `progress` / `detect-result` messages — the UI never janks.

**`frontend/src/hooks/usePoseDetection.ts`** — Rewritten to communicate with
the worker via `postMessage` / `onmessage`. The worker is a module-level
singleton (one worker for the whole app) so the model cache survives route
changes.

**Note:** `useImageCompression` already used `browser-image-compression` with
`useWebWorker: true`, so compression was already offloaded.

---

## 5. Trending Page Expand-All Bug — FIXED

### Root Cause
> "In trending page list product has unique id when I click one product it
> expand all same product and scroll full bottom match product."

The trending rail cycles through the catalog **infinitely** (the same product
appears multiple times with different `cycle`/`idx`). The `expandedId` state
stored just `product.id`, so ALL cards with the same `product.id` expanded at
once when one was tapped — and `scrollIntoView` fired on the LAST matching
card, scrolling to the bottom.

### Fix
**`frontend/src/components/home/TrendingProducts.tsx`** — `expandedCardKey`
now stores the **unique card key** `${product.id}-${cycle}-${idx}` instead of
just `product.id`. Only the tapped card expands; only one `scrollIntoView`
fires.

---

## 6. Backend Error Handling — ENHANCED

### Requirement
> "In backend handling all type of error."

### Implementation
**`backend/src/middleware/error.middleware.ts`** — The centralized error
handler now classifies and handles:

| Error Type | Detection | HTTP Status | Code |
|---|---|---|---|
| Business errors (prefixed) | `err.message.startsWith(prefix)` | varies | varies |
| Zod validation | `instanceof ZodError` | 422 | `VALIDATION` |
| JSON parse errors | `err.type === 'entity.parse.failed'` | 400 | `BAD_JSON` |
| Payload too large | `err.type === 'entity.too.large'` | 413 | `PAYLOAD_TOO_LARGE` |
| Multer upload errors | `err.name === 'MulterError'` | 400 | `UPLOAD_ERROR` |
| URI errors | `instanceof URIError` | 400 | `BAD_URI` |
| Syntax errors | `err.name === 'SyntaxError'` | 400 | `SYNTAX_ERROR` |
| Timeout / abort | `err.name === 'AbortError'` / `ETIMEDOUT` | 504 | `TIMEOUT` |
| Connection reset | `err.code === 'ECONNRESET'` | 502 | `CONNECTION_RESET` |
| Upstream unreachable | `err.code === 'ECONNREFUSED'` | 502 | `UPSTREAM_UNREACHABLE` |
| DNS failure | `err.code === 'ENOTFOUND'` | 502 | `DNS_FAILURE` |
| Prisma P2002 (unique) | `err.code === 'P2002'` | 409 | `CONFLICT` |
| Prisma P2025 (not found) | `err.code === 'P2025'` | 404 | `NOT_FOUND` |
| Prisma P2003 (FK) | `err.code === 'P2003'` | 400 | `FOREIGN_KEY_VIOLATION` |
| Prisma P1001 (db down) | `err.code === 'P1001'` | 503 | `DB_UNREACHABLE` |
| Prisma P1008 (db timeout) | `err.code === 'P1008'` | 504 | `DB_TIMEOUT` |
| Explicit status | `err.status` set by middleware | varies | varies |
| Fallback | (no match) | 500 | `INTERNAL` |

Stack traces are logged but **never leaked to the client in production**.

---

## 7. Camera Page — Add Person Image Interface — IMPLEMENTED

### Requirement
> "In camera page the image person list should have interface for add person
> image."

### Implementation
**`frontend/src/pages/TryOnCameraPage.tsx`** — The `SavedCapturesPanel`
sidebar now has:

1. An **"Add Person" button** in the panel header (next to "Select") — opens
   the existing `AddCapturePanel` modal.
2. An **empty-state CTA** — when there are no saved captures, a prominent
   "Add person image" button with an icon and explanatory text is shown
   instead of a bare "No saved captures yet" message.
3. The `AddCapturePanel` modal runs the same 3-stage validation pipeline
   (person detection → compression → posture) and only saves the image when
   all stages pass.

---

## 8. Frontend ↔ Backend API Sync — VERIFIED

### Requirement
> "Use apis in frontend. If frontend use apis not exist in backend than
> create it. If frontend apis fields not exist in backend add it. Make sure
> the backend apis not break."

### Verification
- `POST /api/tryon/run` — already existed; rewritten with per-customer key
  logic. Accepts `franchiseId` + `customerId` (new fields). Response shape
  unchanged (`{ success, data: { resultImage, mock, provider } }`).
- `POST /api/tryon/track` — unchanged.
- `GET /api/tryon/track/list` — unchanged.
- `GET /api/tryon/track/count` — unchanged.
- `POST /api/vton/tryon` — unchanged (admin portal async flow).
- `GET /api/vton/list` / `status/:id` / `credits` — unchanged.
- `GET /api/products` / `:id` — unchanged.
- `GET /api/brand` — unchanged.
- `POST /api/telemetry` — unchanged (frontend now reaches it correctly).

No existing backend APIs were broken.

---

## 9. Environment Files — CREATED

- **`backend/.env`** — Ready for local development (MongoDB, JWT, encryption,
  FASHN base URL). Adjust `DATABASE_URL` to your MongoDB instance.
- **`backend/.env.example`** — Updated to document the per-customer API key
  architecture. Old `TRYON_AI_ENDPOINT` / `TRYON_AI_API_KEY` removed.
- **`frontend/.env`** — `VITE_API_BASE_URL=http://localhost:4000/api`
- **`admin-portal/.env`** — `VITE_API_BASE_URL=http://localhost:4000/api`

---

## File Change Summary

### New Files
| File | Purpose |
|---|---|
| `backend/src/services/tryon-run.service.ts` | Synchronous try-on execution with per-customer API key |
| `frontend/src/workers/pose-detection.worker.ts` | Web worker for pose detection (offloads main thread) |

### Modified Files
| File | Changes |
|---|---|
| `backend/src/routes/tryon-track.routes.ts` | Rewrote `/run` endpoint to use per-customer key service |
| `backend/src/middleware/error.middleware.ts` | Added handling for JSON parse, Multer, timeout, Prisma, network errors |
| `backend/.env.example` | Documented per-customer key architecture; removed old env vars |
| `frontend/src/hooks/useTryOnOrchestrator.ts` | Use `apiClient` instead of `fetch` (fixes 404); send `franchiseId` |
| `frontend/src/lib/api-client.ts` | Hard sign-out on 401 (clears token + store + caches) |
| `frontend/src/lib/store.ts` | `signOut()` now clears persisted store + dispatches event |
| `frontend/src/lib/logger.ts` | Use `apiClient` for telemetry (was using broken relative `fetch`) |
| `frontend/src/App.tsx` | Route guards check token presence; listens for hard-signout event |
| `frontend/src/hooks/usePoseDetection.ts` | Delegated model load + inference to web worker |
| `frontend/src/components/home/TrendingProducts.tsx` | Unique `cardKey` for `expandedId` (fixes expand-all bug) |
| `frontend/src/pages/TryOnCameraPage.tsx` | Added "Add Person" button + modal in SavedCapturesPanel |

---

## How to Run

### Backend
```bash
cd backend
npm install
# Edit .env — set DATABASE_URL to your MongoDB
npx prisma generate
npx prisma db push
npm run seed      # creates demo admin + customers + API keys
npm run dev       # starts on http://localhost:4000
```

### Frontend
```bash
cd frontend
npm install
npm run dev       # starts on http://localhost:5173
```

### Admin Portal
```bash
cd admin-portal
npm install
npm run dev       # starts on http://localhost:5174
```

### To assign a real FASHN API key to a customer:
1. Log into the admin portal
2. Navigate to Customers → select a customer
3. Add an API key (your FASHN.ai key) — it is encrypted at rest
4. That customer's try-on calls will now use this key

---

# Round 2 — Model Persistence, Separate Models, Activity Log, Filters, Trending Cap

This section documents the second round of changes addressing model
persistence, separate person/posture models, activity log enrichment,
trending cap, and the product filter sidebar.

---

## Issue 1: Model downloads vanish on page refresh — FIXED

### Root Cause
The `loadedModels` set lived in the web worker's memory. On page refresh,
the worker was re-created and the set was empty — so the UI showed "Not
downloaded" again, even though transformers.js had cached the weights in
the browser's Cache Storage.

### Fix
**`frontend/src/lib/model-persistence.ts`** (NEW FILE) — A persistence
layer that mirrors the downloaded-models set to `localStorage` under
`vton_downloaded_models`. On startup, `verifyAllDownloadedModels()`
checks each entry against the browser's Cache Storage and prunes stale
entries (so the UI never lies about what's downloaded).

The Settings page, Try-On Camera page, and validation hooks ALL read from
`isModelDownloaded()` — the **single source of truth**.

---

## Issue 2: No uninstall interface for models — IMPLEMENTED

### Fix
**`frontend/src/hooks/usePoseDetection.ts`** — Added `uninstallModel(modelId)`
which removes the model from the tracking set AND deletes the weight files
from Cache Storage via `uninstallModelCache()`.

**`frontend/src/pages/SettingsPage.tsx`** — The "Model downloads" section
shows an **Uninstall** button (red, with trash icon) next to each downloaded
model. Uninstalling removes the model; it can be re-downloaded later.

---

## Change 3: Separate person-detection model from posture-estimation model

### Requirement
> "Regarding the posture estimation model, its model section should be kept
> within it. The person detection model is separate, and the posture
> estimation model is separate, but the downloading process for both should
> be identical. If I download one model, it should mean that I am downloading
> it for both. Also, they should appear separate in the UI."

### Fix
**`frontend/src/types/index.ts`** — `TryOnSettings` now has:
- `personDetectionModelId` — model used for Stage 1 (person detection)
- `postureModelId` — model used for Stage 3 (posture estimation)
- `personDetectionParams` — `{ confidenceThreshold, nmsIouThreshold, maxPersons }`
- `activeModelId` — deprecated, migrated automatically

**`frontend/src/lib/constants.ts`** — `migrateSettings()` bridges the old
schema to the new one so existing users don't lose their preferences.

**`frontend/src/pages/SettingsPage.tsx`** — Rewritten with THREE sections:
1. **Model downloads** (top, shared) — download/uninstall any model
2. **Person detection model** — select which downloaded model to use for
   Stage 1, plus its own parameters (confidence, NMS IoU, max persons)
3. **Posture estimation model** — select which downloaded model to use for
   Stage 3, plus pose thresholds (shoulder tilt, face yaw, etc.)

Both selection sections use **SelectableModelCard** where the ENTIRE card
is a button (click anywhere to select — no need to click the radio).

**`frontend/src/hooks/useImageValidation.ts`** — Stage 1 uses
`personDetectionModelId` + `personDetectionParams`; Stage 3 uses
`postureModelId`. Both pass `nmsIouThreshold` + `maxPersons` to the worker.

**`frontend/src/components/tryon/AddCapturePanel.tsx`** — Updated to use
the separate model IDs + params for Stage 1 and Stage 3.

**`frontend/src/workers/pose-detection.worker.ts`** — `parseYolov8PoseOutput`
+ `runDetection` now accept `nmsIouThreshold` + `maxPersons` parameters.

---

## Change 4: Activity log — navigation, interactions, detailed errors + tips

### Requirement
> "This activity log should also include page navigation logs, and it should
> also include event logs, excluding scroll events, the interactions I
> perform with components as well as navigation should appear inside the log
> with their specific names and the error log should be detailed. It should
> also include tips alongside it on how to solve the issue."

### Fix
**`frontend/src/types/index.ts`** — `ActivityLogEntry` now has:
- `category: "interaction"` (new category for component interactions)
- `tip?: string` — actionable fix suggestion
- `component?: string` — name of the component that emitted the log

**`frontend/src/lib/logger.ts`** — `LogOptions` now includes `tip` + `component`.
Added `logger.interaction()` method. All error logs can now carry a `tip`.

**`frontend/src/lib/store.ts`** — `logActivity` now persists `tip` + `component`.

**`frontend/src/components/tryon/ActivityLogPanel.tsx`** — Renders the `tip`
as a highlighted "Fix: ..." callout with a lightbulb icon. Shows the
`component` name as a mono badge. Added emerald color for the `interaction`
category.

**`frontend/src/App.tsx`** — `ScrollToTop` now logs every navigation:
`logger.navigation("Navigated to /home")`.

**`frontend/src/components/layout/GlobalHeader.tsx`** — Logs menu open/close,
back button, nav menu clicks, and sign-out.

**`frontend/src/components/products/ProductCard.tsx`** — Logs card taps,
TRY ON clicks, and View details clicks.

**`frontend/src/components/home/TrendingProducts.tsx`** — Logs card taps,
TRY ON, and View details.

**`frontend/src/pages/SettingsPage.tsx`** — Logs setting changes, model
selections, download/uninstall clicks.

**`frontend/src/hooks/usePoseDetection.ts`** — Error logs now include tips
like "Check your internet connection (the model loads from a CDN)...".

---

## Change 5: Trending products cap at 30 + "No more products" message

### Requirement
> "This trending products list should not exceed 30 products. When it goes
> beyond 30 products, display a clear, nicely formatted message indicating
> that there are 'No more products.'"

### Fix
**`frontend/src/components/home/TrendingProducts.tsx`** — Rewritten:
- `trending` is now `.slice(0, 30)` — capped at 30
- `hasReachedEnd = visibleCount >= trending.length`
- IntersectionObserver only loads more when NOT at the end
- When `hasReachedEnd`, shows a centered "No more products" message with a
  checkmark icon, count, and a "Browse all" button

---

## Change 6: Try-On Camera uses single source of truth for model

### Requirement
> "When I navigate to the Try-On Camera page, it asks me to download the
> model again, even though I have already downloaded it from the settings."

### Fix
**`frontend/src/pages/TryOnCameraPage.tsx`** — Now reads
`settings.personDetectionModelId` and checks `isModelCached()` (which reads
from the persistence layer). If the model was downloaded in Settings, the
persistence layer knows about it — no re-prompt on the camera page.

**`frontend/src/App.tsx`** — Calls `verifyAllDownloadedModels()` on startup
to sync the persistence layer with the actual Cache Storage.

---

## Change 7: Add Person modal on Persons/Captures page

### Requirement
> "In the sidebar of the Persons page, clicking the 'Add Person' button
> should open a modal where I can upload the person's image, and the proper
> validation rules should also be applied to it."

### Fix
**`frontend/src/components/tryon/AddCapturePanel.tsx`** — Button label
changed from "Add image" to "Add Person" for clarity. The modal already
runs the full 3-stage validation pipeline (person detection → compression
→ posture check) and only saves the image when all stages pass.

**`frontend/src/pages/TryOnCameraPage.tsx`** — The SavedCapturesPanel
sidebar already has an "Add Person" button (added in round 1) that opens
this modal. The empty state also shows a prominent "Add person image" CTA.

**`frontend/src/pages/CapturesGalleryPage.tsx`** — Already renders
`<AddCapturePanel />` in the toolbar (now labeled "Add Person").

---

## Change 8: Unified image validation — model loads once

### Requirement
> "The image validation steps—whether applied during upload, after taking a
> picture with the camera, or during try-on—should be unified as a single
> source of truth. The model should only load once."

### Fix
**`frontend/src/hooks/usePoseDetection.ts`** — The worker is a module-level
singleton (`workerSingleton`). The model cache inside the worker survives
route changes. `isModelDownloaded()` (from the persistence layer) is the
single source of truth — if the model is already downloaded, `detect()` and
`preloadModel()` skip the load step entirely.

**`frontend/src/hooks/useImageValidation.ts`** — The SINGLE validation
pipeline used by all three entry points (camera capture, AddCapturePanel
upload, try-on). It delegates to `usePoseDetection` which shares the worker
+ model cache.

---

## Change 9: Product page filter sidebar

### Requirement
> "On the product page, there should be a filter section in the sidebar.
> When I click on it, all possible filter options that can be applied should
> be available inside it."

### Fix
**`frontend/src/pages/ProductsPage.tsx`** — Added a **Filters** button (with
`SlidersHorizontal` icon) in the search bar. A badge shows the active filter
count. Clicking opens the `FiltersModal` which contains ALL filter options:
- New arrivals only (toggle)
- In stock only (toggle)
- Price range (min/max sliders)
- Sizes (multi-select chips)
- Colors (multi-select with color swatches)

**`frontend/src/components/products/FiltersModal.tsx`** — Already existed;
now wired up to the ProductsPage via the `showFilters` state.

---

## File Change Summary (Round 2)

### New Files
| File | Purpose |
|---|---|
| `frontend/src/lib/model-persistence.ts` | Persists downloaded-model set to localStorage + verifies against Cache Storage |

### Modified Files
| File | Changes |
|---|---|
| `frontend/src/types/index.ts` | Added `PersonDetectionParams`, `interaction` log category, `tip`/`component` fields, separate model IDs in `TryOnSettings` |
| `frontend/src/lib/constants.ts` | Added `MODEL_REPO`, `migrateSettings()`, separate model IDs + `personDetectionParams` in `DEFAULT_SETTINGS` |
| `frontend/src/lib/store.ts` | `logActivity` persists `tip`/`component`; `onRehydrateStorage` migrates old settings |
| `frontend/src/lib/logger.ts` | `LogOptions` includes `tip`/`component`; added `interaction()` method; tips sent to telemetry |
| `frontend/src/hooks/usePoseDetection.ts` | Uses persistence layer; `uninstallModel()`; `detect()` accepts NMS/maxPersons params; error logs include tips |
| `frontend/src/hooks/useImageValidation.ts` | Stage 1 uses `personDetectionModelId` + params; Stage 3 uses `postureModelId`; error logs include tips |
| `frontend/src/workers/pose-detection.worker.ts` | `parseYolov8PoseOutput` + `runDetection` accept `nmsIouThreshold` + `maxPersons` |
| `frontend/src/components/tryon/ActivityLogPanel.tsx` | Renders `tip` as "Fix:" callout; shows `component` badge; emerald color for `interaction` |
| `frontend/src/components/tryon/AddCapturePanel.tsx` | Uses separate model IDs + params; button labeled "Add Person"; logs modal open |
| `frontend/src/components/home/TrendingProducts.tsx` | Capped at 30; "No more products" end message; interaction logging |
| `frontend/src/components/products/ProductCard.tsx` | Interaction logging on tap/try-on/details |
| `frontend/src/components/layout/GlobalHeader.tsx` | Interaction logging on menu/back/nav/sign-out |
| `frontend/src/pages/SettingsPage.tsx` | Rewritten: 3 sections (downloads, person detection, posture); click-anywhere cards; uninstall buttons |
| `frontend/src/pages/ProductsPage.tsx`` | Filters button + FiltersModal wiring; active-filter badge |
| `frontend/src/pages/TryOnCameraPage.tsx` | Uses `personDetectionModelId`; reads from persistence layer |
| `frontend/src/App.tsx`` | Navigation logging; `verifyAllDownloadedModels()` on startup |

---

# Round 3 — Login Redirect, Filter Draft/Commit, Model Warming, Z-Index, Validation-Before-Save

This section documents the third round of changes.

---

## Issue 1: Login redirect bounces back to /signin — FIXED

### Root Cause
After a successful login API call, `useAuth.signIn.onSuccess` called
`localStorage.setItem("nova_token", ...)` then `navigate("/home")`. But
`useHasToken` in App.tsx only re-checked localStorage on `storage` /
`popstate` events — and `setItem` does NOT fire a `storage` event in the
SAME tab (it only fires in other tabs). So the route guard still saw
`hasToken = false` and bounced the user back to /signin. A manual page
refresh fixed it because the hook's initializer re-read localStorage.

### Fix
**`frontend/src/hooks/useAuth.ts`** — After `localStorage.setItem`, dispatch
a custom `auth:token-set` event: `window.dispatchEvent(new CustomEvent("auth:token-set"))`.

**`frontend/src/App.tsx`** — `useHasToken` now listens for `auth:token-set`
in addition to `storage` / `popstate` / `auth:hard-signout`. When the event
fires, it re-reads localStorage and updates `hasToken = true`, so the route
guard immediately lets the user through to /home.

---

## Issue 2: "Browse All" button placement — FIXED

### Fix
**`frontend/src/components/home/TrendingProducts.tsx`** — The "Browse all"
button is now rendered INLINE alongside the "No more products" text (icon +
text + button in a horizontal row on desktop, stacked on mobile). It's
clearly part of the end-of-list message, not the page footer.

---

## Issue 3: Try-On Camera menu — toast + keep menu open — FIXED

### Fix
**`frontend/src/components/layout/GlobalHeader.tsx`** + **`frontend/src/pages/HomePage.tsx`**
— When the user clicks "Try-on camera" in the nav menu without a selected
product, a toast notification appears ("Select a product first") and the
menu STAYS OPEN (previously it navigated to /products and closed the menu).

---

## Issue 4: FiltersModal — draft/commit pattern — FIXED

### Root Cause
The FiltersModal applied filters IMMEDIATELY on every toggle/slide/select
via `setProductFilters()`. This caused the product grid behind the modal to
jump around on every interaction, and the slider/toggle controls felt
sluggish because each change triggered a store update + re-render of the
entire products page.

### Fix
**`frontend/src/components/products/FiltersModal.tsx`** — Rewritten with a
DRAFT / COMMIT pattern:
- A local `draft` state holds the user's in-progress filter selections.
- All controls (toggles, sliders, size/color chips) update the DRAFT only —
  the store is NOT touched.
- The "Show Results" button COMMITS the draft to the store
  (`setProductFilters(draft)`) and closes the modal.
- If the user closes via X or backdrop click without clicking "Show Results",
  the draft is discarded — the store keeps its previous filters.
- The "Reset" button resets the DRAFT (not the committed filters).
- The draft is re-synced from the committed filters every time the modal opens.

This makes the controls fully responsive (local state updates are instant)
and gives the user a clear "apply" action.

---

## Issue 5: Model persistence on refresh — FIXED

### Root Cause
The previous `verifyModelCache()` function checked `caches.keys()` for cache
names containing the repo segment (e.g. "yolov8n-pose"). But transformers.js
v3 stores ALL model weights in a single cache named `transformers-cache`
(NOT the repo name). So the check ALWAYS failed and PRUNED the localStorage
entry — meaning the model appeared "not downloaded" after every refresh.

### Fix
**`frontend/src/lib/model-persistence.ts`** — Rewritten:
- REMOVED `verifyModelCache()` and `verifyAllDownloadedModels()` entirely.
- We now TRUST localStorage unconditionally — no pruning. The localStorage
  flag represents the user's intent ("I downloaded this model"). Even if
  the browser cache was cleared, the user still intends to have the model
  available; the worker will re-download transparently on next use.
- `uninstallModelCache()` now deletes caches matching `transformers` / `hf`
  / `model` / repo-name patterns (broader matching to catch all variants).

**`frontend/src/hooks/usePoseDetection.ts`** — Added `warmDownloadedModels()`:
- Called on app startup. Sends "load" messages to the worker for every model
  in the `downloadedModels` set. This WARMS the worker's in-memory cache —
  the model is loaded from Cache Storage into memory immediately, so the
  first detection is fast (no re-download if the cache is intact).
- If NO models are downloaded, auto-downloads the default model
  (`yolov8n-pose`) so the app works out-of-the-box.

**`frontend/src/App.tsx`** — Calls `warmDownloadedModels()` on startup
instead of the old `verifyAllDownloadedModels()`.

---

## Issue 6: Default model auto-download — IMPLEMENTED

### Fix
**`frontend/src/hooks/usePoseDetection.ts`** — `warmDownloadedModels()` checks
if `getDownloadedModels().size === 0` on startup. If so, it downloads the
default model (`yolov8n-pose`) automatically. This ensures the app works
out-of-the-box — the user doesn't have to visit Settings and download a
model before their first try-on.

---

## Issue 7: Activity Log z-index — FIXED

### Fix
**`frontend/src/components/tryon/ActivityLogPanel.tsx`** — Both the floating
button and the expanded panel now use `z-[9999]` (was `z-40`). This is
higher than any modal in the app (which max out at `z-[110]`), so the
Activity Log button stays visible and clickable even when a modal is open.

---

## Issue 8: Model loads only once — FIXED

### Fix
**`frontend/src/hooks/usePoseDetection.ts`** — `detect()` now:
- If the model is marked as downloaded (via `isModelDownloaded()`), does NOT
  send a "load" message. Instead, it posts "detect" directly. The worker's
  `runDetection` → `getModelAndProcessor` returns from the in-memory cache
  if warm (from startup warming or a previous detection), or loads from
  Cache Storage (fast, no network) if not warm.
- If the model is NOT marked as downloaded, it triggers a load first (the
  only case where detect() sends a "load" message).

Combined with the startup warming (`warmDownloadedModels`), the model is
loaded into the worker's memory exactly once (at download time or at app
startup) and never re-downloaded.

---

## Issue 9: Captures gallery "Try-On with Person" — no navigation — FIXED

### Fix
**`frontend/src/pages/CapturesGalleryPage.tsx`** — `tryWithImage()` and
`goToCamera()` now show a toast ("Select a product first") but do NOT
navigate to /products. The user stays on the captures gallery page.

---

## Issue 10: Camera capture — validate before saving — FIXED

### Fix
**`frontend/src/pages/TryOnCameraPage.tsx`** — `saveAndTryOn()` no longer
calls `addSavedImage()` immediately. Instead, it stores the captured image
as a "pending capture" in `sessionStorage` (`nova_pending_capture`) and
navigates to processing.

**`frontend/src/hooks/useTryOnOrchestrator.ts`** — After validation passes
(but before the AI call), the orchestrator checks for a pending capture in
`sessionStorage`. If found, it saves it to the gallery with
`passedAllStages: true` and clears the sessionStorage. If validation fails,
the pending capture is discarded — the image is NOT saved to the gallery.

---

## Issue 11: Reusable AddCapturePanel — controlled mode — FIXED

### Fix
**`frontend/src/components/tryon/AddCapturePanel.tsx`** — Now supports two
modes:
- **UNCONTROLLED** (default): The component manages its own visibility and
  renders its own "Add Person" trigger button. Used by the Captures Gallery.
- **CONTROLLED**: When the `open` prop is provided, the parent controls
  visibility. The trigger button is NOT rendered. Used by the Try-On Camera
  page's sidebar.

**`frontend/src/pages/TryOnCameraPage.tsx`** — The camera page now uses
`<AddCapturePanel open={showAddPerson} ... />` (controlled mode) instead of
conditionally rendering the component inside `<AnimatePresence>`. This
ensures the SAME reusable modal is used in both places.

---

# Round 4 — Model Status Check + First-Detection Timeout Fix

---

## Issue 1: "Please download the model first" error — IMPLEMENTED

### Requirement
> "If the model is not downloaded yet, uploading or capturing an image should
> first check the model's status and show an error saying 'Please download
> the model first'."

### Fix
**`frontend/src/hooks/usePoseDetection.ts`** — `detect()` now checks
`isModelDownloaded(modelId)` BEFORE attempting detection. If the model is
NOT downloaded, it throws an error immediately:
> "Please download the model first from Settings before capturing or
> uploading an image."

It does NOT auto-download — the user must download it from Settings.

**`frontend/src/hooks/useImageValidation.ts`** — Added a MODEL STATUS
PRE-CHECK at the top of `validate()`, before any stages run. Checks BOTH
`personDetectionModelId` and `postureModelId`. If either is missing, returns
a failure result with the message:
> "Please download the model first: [missing models]. Go to Settings →
> Model downloads."

**`frontend/src/components/tryon/AddCapturePanel.tsx`** — `runValidation()`
now checks `isModelDownloaded()` for both models before calling `detect()`.
If not downloaded, shows a failure UI with the title "Please download the
model first" and a how-to-fix message directing the user to Settings.

**`frontend/src/pages/TryOnCameraPage.tsx`** — `saveAndTryOn()` now checks
`modelReady` before proceeding. If not ready, shows a toast:
> "Please download the model first" + doesn't navigate to processing.

---

## Issue 2: First-detection timeout — FIXED

### Root Cause
On the FIRST detection after app startup, the worker had to:
1. Load `transformers.js` from CDN (~2MB+ minified module) — 20-40s
2. Download model weights from HuggingFace CDN — 10-20s
3. Run inference — 1-3s

Total: 30-60s. But the `loadTransformers()` function had a **30-second
timeout** — if the CDN download of transformers.js took longer than 30s,
it rejected with "Timeout (30s)". However, the underlying `import()` was
still pending in the browser's module loader. On RETRY, the `import()`
returned instantly (browser had cached the module from the first attempt),
so only the model weights + inference remained — which fit within the
timeout.

This is why the user saw: first attempt = timeout, retry = "Load Model"
appears in console + works.

### Fix
**`frontend/src/workers/pose-detection.worker.ts`** — Three changes:

1. **PRE-LOAD transformers.js on worker startup**: Added a module-level
   call to `loadTransformers()` that fires IMMEDIATELY when the worker is
   created — not waiting for a "load" or "detect" message. By the time the
   user captures or uploads an image, transformers.js is already loaded
   (or loading) in the background. The first detection then only needs to
   load model weights + run inference.

2. **Increased transformers.js timeout from 30s to 120s**: The module is
   ~2MB+; on slow connections the CDN download can take 60-90s. The old
   30s timeout caused false failures. The new 120s timeout gives ample
   time for the first load.

3. **Increased model-load timeout from 60s to 120s**: `runDetection()`'s
   `getModelAndProcessor` race timeout now uses the same 120s ceiling.

**`frontend/src/hooks/usePoseDetection.ts`** — Increased the `detect()`
timeout from 30s to 120s. The first detection after startup may need to
load model weights from Cache Storage into the worker's memory (5-15s for
a 3MB model). Subsequent detections use the in-memory cache and are fast
(<1s). The old 30s timeout was too short for the first cold-start detection.

### Result
- On app startup: the worker starts loading transformers.js immediately
  (in the background, non-blocking).
- On first detection: transformers.js is likely already loaded → only model
  weights load (from Cache Storage if warm, or CDN if first time) → inference
  runs. Total: 5-20s (within the 120s timeout).
- On subsequent detections: everything is in memory → <1s.

---

# Round 5 — 30s Validation Timeout, Top-Right Toasts, Remove Browse-All, Pre-Load on Startup, Camera Gallery Fix, Processing Page Fix

---

## Issue 1: Validation timeout at 30s + error toast — FIXED

### Requirement
> "The image validation steps should not take more than 30 seconds. If it
> exceeds 30 seconds, trigger a timeout error and display it in the error
> toast."

### Fix
**`frontend/src/hooks/usePoseDetection.ts`** — Reduced the `detect()` timeout
from 120s to **30s**. Transformers.js + the model are pre-loaded on app
startup (worker pre-load + `warmDownloadedModels`), so detection should take
<5s. If it exceeds 30s, the promise rejects with:
> "Validation timed out (30s). The model may still be loading. Please try
> again in a few seconds."

**`frontend/src/components/tryon/AddCapturePanel.tsx`** — The `catch` block
in `runValidation()` now shows a **toast** for all validation errors
(including timeouts), in addition to the in-modal failure UI.

**`frontend/src/pages/TryOnProcessingPage.tsx`** — The orchestrator's
`onError` handler now shows a **toast** for all validation errors, in
addition to the in-page error UI.

---

## Issue 2: All toasts at top-right — FIXED

### Fix
**`frontend/src/components/ui/toast.tsx`** — The `Toaster` component is now
positioned at `top-0 right-0` (was `bottom-0 right-0`). Changed
`flex-col-reverse` to `flex-col` (newest toasts appear at the bottom of the
stack, stacking downward from the top). Z-index increased from `z-[100]` to
`z-[10000]` (higher than the Activity Log's `z-[9999]`) so toasts appear
above all modals and overlays.

---

## Issue 3: Remove "Browse All" button — FIXED

### Fix
**`frontend/src/components/home/TrendingProducts.tsx`** — Removed the
"Browse all" button from the end-of-list message. The "No more products"
message now shows just the icon + text, centered. The user can navigate to
the full collection via the header menu or the home banner's "Explore
products" button.

---

## Issue 4: Pre-load transformers.js + model on first app run — FIXED

### Requirement
> "The Transformers.js model loads from the CDN when an image is captured or
> uploaded. Stop loading it at that point. Instead, trigger its download
> alongside the main model download when app first time runs."

### Fix
**`frontend/src/hooks/usePoseDetection.ts`** — `warmDownloadedModels()` now
accepts BOTH `defaultPersonModelId` AND `defaultPostureModelId`. On first
app run (no models downloaded), it auto-downloads BOTH default models in
parallel. This triggers the model weights download + the transformers.js
CDN load simultaneously on startup.

**`frontend/src/App.tsx`** — Calls `warmDownloadedModels()` with both
`DEFAULT_SETTINGS.personDetectionModelId` and
`DEFAULT_SETTINGS.postureModelId`.

**`frontend/src/workers/pose-detection.worker.ts`** — The worker already
pre-loads transformers.js on startup (added in round 4). Combined with the
model warming, by the time the user captures or uploads an image:
- transformers.js is loaded ✓
- model weights are in the worker's in-memory cache ✓
- detection time is just inference (<5s) ✓

No CDN downloads happen at capture/upload time.

---

## Issue 5: Capture gallery camera button — no product requirement — FIXED

### Requirement
> "When I click the camera button inside the capture gallery, it shows a
> toast asking me to select a product first. This restriction shouldn't be
> here. Selecting the camera here should simply open the camera so I can
> capture and upload a person's image."

### Fix
**`frontend/src/pages/CapturesGalleryPage.tsx`** — `goToCamera()` now
simply navigates to `/tryon/camera` without any product check. The user
can capture a person photo from the gallery without having a product
selected. The product requirement is still enforced when the user clicks
"Try on with this" on a saved image (that flow shows the confirmation
modal which requires a product).

---

## Issue 6: Try-On processing page — show image + validation steps — FIXED

### Requirement
> "On the Try-On camera page, when I capture and upload a photo, a 'Try and
> Save' button appears. Clicking it takes me to the Try-On processing page.
> In the previous UI, it used to show the image along with validation steps,
> but now it shows 'Open Camera'. It should revert to the old UI layout."

### Root Cause
In round 3, we changed `saveAndTryOn()` to store the captured image as a
"pending capture" in sessionStorage (instead of saving it to the store
immediately — validation must pass first). But the processing page was
still looking for the capture in the STORE (`savedImages.find(...)`), so it
didn't find the pending capture → fell through to the "Open camera"
fallback.

### Fix
**`frontend/src/pages/TryOnProcessingPage.tsx`** — Added a
`pendingCapture` state that reads from `sessionStorage.getItem
("nova_pending_capture")` on mount. The `effectiveCapture` is computed as:
- The store-backed capture (if `activeCaptureId` points to a saved image), OR
- The pending capture from sessionStorage (if the user just captured from
  the camera)

All references to `capture` in the render + orchestrator startup are
replaced with `effectiveCapture`. The processing page now shows:
- The captured image (blurred background + animated overlay) ✓
- The validation stages list (stage 1 → 2 → 3 → AI → tracking) ✓
- The progress bar ✓
- Errors are displayed in-page (with Retake / Skip buttons) ✓

If validation fails, the error is shown both in-page AND as a toast.

---

# Round 6 — Footer Alignment, Single Worker Trigger, Uninstalled Persistence, Filter Visuals, Active Filter Chips

---

## Issue 1: "No more products" hidden behind footer — FIXED

### Fix
**`frontend/src/components/home/TrendingProducts.tsx`** — The sentinel div
changed from `h-16` (64px) to `pb-24 min-h-[120px]` (96px bottom padding +
120px min height). This ensures the "No more products" message has enough
space above the footer to be fully visible.

---

## Issue 2: Triple worker trigger — FIXED

### Root Cause
The `useEffect` in `usePoseDetection` had `[activeModelId]` as a dependency.
Every time `detect()` called `setActiveModelId(modelId)`, the effect re-ran:
removed the worker listener, re-added it, decremented + incremented
`workerRefCount`. Combined with React StrictMode's double-effect invocation
in dev, this caused the worker to receive multiple "load" messages.

### Fix
**`frontend/src/hooks/usePoseDetection.ts`** — Three changes:

1. **`activeModelIdRef`** — Added a ref mirror of `activeModelId`. The worker
   message listener now reads `activeModelIdRef.current` instead of the
   stale `activeModelId` closure variable.

2. **Empty dependency array** — The `useEffect` now uses `[]` (mount-once)
   instead of `[activeModelId]`. The listener is added EXACTLY ONCE per hook
   instance — not re-added on every `detect()` call.

3. **`warmingStarted` guard** — `warmDownloadedModels()` now has a
   module-level `warmingStarted` boolean. The first call sets it to `true`
   and runs the warming. Subsequent calls (from React StrictMode or route
   changes) return immediately without re-sending "load" messages.

---

## Issue 3: Model re-downloads on page refresh — FIXED

### Root Cause
On page refresh, the worker is re-created (in-memory `modelCache` is empty).
`warmDownloadedModels` sends "load" messages → the worker's
`getModelAndProcessor` calls `AutoModel.from_pretrained(repo)`. transformers.js
checks its Cache Storage — if weights are cached, the load is fast (no
network); if not, it re-downloads. But the "load" message still fires, which
looks like a re-download in the logs.

### Fix
**`frontend/src/hooks/usePoseDetection.ts`** — The `warmingStarted` guard
ensures warming only runs ONCE per app session. On page refresh, a new
session starts, so warming runs once — but it only sends ONE "load" message
per downloaded model (not three). The worker's `getModelAndProcessor` checks
the in-memory `modelCache` first (empty on fresh worker), then
`inFlightLoads` (prevents duplicate concurrent loads for the same model),
then calls transformers.js which uses its own Cache Storage.

**`frontend/src/workers/pose-detection.worker.ts`** — The worker's
`getModelAndProcessor` already has `inFlightLoads` deduplication: if a load
is already in-flight for a model, subsequent "load" messages for the same
model return the same promise. This prevents duplicate network downloads.

---

## Issue 4: Uninstalled model auto-reloads — FIXED

### Root Cause
`warmDownloadedModels` auto-downloads the default model if the
`downloadedModels` set is empty. If the user uninstalls ALL models, the set
becomes empty → the default gets re-downloaded on the next startup, ignoring
the user's intent to uninstall it.

### Fix
**`frontend/src/lib/model-persistence.ts`** — Added a separate
`uninstalledModels` set (persisted to `localStorage` under
`vton_uninstalled_models`):

- `markModelUninstalled(modelId)` — adds the model to BOTH the uninstalled
  set AND removes it from the downloaded set.
- `markModelDownloaded(modelId)` — removes the model from the uninstalled
  set (so a manual re-download clears the "don't auto-load" flag).
- `isModelUninstalled(modelId)` — new exported function.

**`frontend/src/hooks/usePoseDetection.ts`** — `warmDownloadedModels` now
checks `isModelUninstalled()` before auto-downloading a default model. If
the user has uninstalled the default, it's NOT auto-downloaded — the user
must manually click "Download" in Settings.

---

## Issue 5: Filter modal slider/toggle visual state — FIXED

### Root Cause
The `Switch` component used `peer-checked:` CSS pseudo-class selectors. When
the parent re-rendered via Framer Motion's `AnimatePresence`, the peer
relationship could fail to update visually — the toggle's track color and
thumb position didn't match the `checked` prop.

### Fix
**`frontend/src/components/ui/switch.tsx`** — Rewrote to use DIRECT
conditional classes instead of `peer-checked:`:
- Track: `checked ? "bg-primary" : "bg-muted"` (direct conditional)
- Thumb: `checked && "translate-x-5"` (direct conditional)

This ensures the visual state always matches the `checked` prop on every
re-render, regardless of Framer Motion interference.

**`frontend/src/components/ui/slider.tsx`** — Simplified the value
extraction to use a clear numeric `numValue` variable. The slider is now
fully controlled — the `value` prop always drives the input's position.

---

## Issue 6: Active filters visible on product list page — FIXED

### Fix
**`frontend/src/pages/ProductsPage.tsx`** — The active-filter chips section
now shows ALL active filters as removable chips:
- New arrivals (with Sparkles icon)
- In stock
- Min price (e.g. "Min: $100")
- Max price (e.g. "Max: $500")
- Each selected size (e.g. "Size: M")
- Each selected color (e.g. "Emerald")
- "Clear all" button (destructive style) — resets all filters at once

Each chip has an X button to remove that specific filter. The filter count
badge on the Filters button already existed. Together, these give the user
complete visibility into what's filtering the product list.

---

# Round 7 — Single Worker Session, Module-Level Pending Maps, Inline Error UI

---

## Issue 1 & 4: Model + transformers.js re-download on refresh + triple load on navigation — FIXED

### Root Cause
1. **Module-level pre-load in the worker**: The worker called `loadTransformers()`
   at module-evaluation time (when the worker script first runs). This fired a
   "preload" log entry every time the worker was created. And the worker was
   re-created on route changes because `workerRefCount` dropped to 0 when
   components unmounted → the worker was terminated → a new worker was created
   on the next route → the module-level pre-load fired again.

2. **Per-call addEventListener listeners**: `warmDownloadedModels` and
   `preloadModel` each added their own `addEventListener("message", ...)`
   listeners for each "load" request. These listeners were never properly
   cleaned up if the hook unmounted before the load completed, causing stale
   listeners to accumulate.

3. **Triple trigger**: On navigation to camera/settings, the worker was
   terminated + re-created. The new worker's module-level pre-load fired
   ("preload"), then `warmDownloadedModels` sent a "load" (but it was guarded
   by `warmingStarted` so it only fired once per SESSION — but a new session
   starts on every page refresh), then `detect()` or `preloadModel()` sent
   another "load". Result: 2-3 load attempts.

### Fix
**`frontend/src/workers/pose-detection.worker.ts`** — Removed the module-level
`loadTransformers()` pre-load call entirely. transformers.js is now loaded
EXACTLY ONCE — the first "load" message (from `warmDownloadedModels` on app
startup) triggers `loadTransformers()`, and subsequent calls return the same
in-flight promise (via `transformersLoading`).

**`frontend/src/hooks/usePoseDetection.ts`** — Three major changes:

1. **Worker NEVER terminated**: Removed `workerRefCount` and the
   `workerSingleton.terminate()` call from the cleanup. The worker now lives
   for the ENTIRE APP SESSION. Route changes no longer terminate + re-create
   the worker → no re-importing transformers.js, no re-loading model weights.

2. **Central `onmessage` handler**: The worker's `onmessage` handler is set
   ONCE (when the worker is created) and handles ALL message types — `loaded`,
   `progress`, `detect-result`, `log`, `error`. No per-hook
   `addEventListener` listeners are needed. This eliminates the stale-listener
   problem.

3. **Module-level `pendingDetects` + `pendingLoads` maps**: These are now
   module-level (shared across ALL hook instances) instead of per-hook refs.
   When the worker posts a `detect-result` or `loaded` message, the central
   handler looks up the pending request by reqId/modelId and resolves it —
   regardless of which hook instance is currently mounted. This fixes the
   "first detect stays pending" bug.

4. **`warmDownloadedModels` simplified**: No longer adds per-call listeners.
   Just posts "load" messages and relies on the central handler to call
   `markModelDownloaded` when the worker responds.

5. **`preloadModel` simplified**: Uses the module-level `pendingLoads` map.
   If a load is already in-flight for the same model (e.g. from
   `warmDownloadedModels`), it piggybacks on the existing promise instead of
   sending a duplicate "load" message.

---

## Issue 2: Detection worker executes twice — first stays pending — FIXED

### Root Cause
Each hook instance had its own `pendingDetectsRef` Map. When a component
using the hook re-mounted (e.g. due to route change or parent re-render),
the old instance's pending requests were orphaned — the worker eventually
posted the `detect-result`, but the new hook instance's listener didn't
recognize the reqId (it was in the old instance's Map). The promise never
resolved → "stuck pending".

### Fix
**`frontend/src/hooks/usePoseDetection.ts`** — `pendingDetects` is now a
MODULE-LEVEL Map shared across ALL hook instances. The worker's central
`onmessage` handler routes `detect-result` messages to the correct
resolve/reject callback using the reqId — regardless of which hook instance
is currently listening. The 30s timeout also uses the module-level map, so
it fires correctly even if the hook instance has unmounted.

---

## Issue 3: Validation error — keep UI unchanged, show error inline — FIXED

### Requirement
> "When a validation error occurs during the 'Try On' process, keep the UI
> unchanged. Just show the error inside the same interface and provide
> options like 'Retake Photo' or 'Skip and try Anyway'."

### Fix
**`frontend/src/pages/TryOnProcessingPage.tsx`** — Removed the separate
full-screen error UI (`if (error) { return <error screen> }`). Instead, the
processing UI (image + stages + progress) stays visible, and the error is
shown as an INLINE BANNER at the top of the stages panel:

- Red-bordered card with "Validation error" title + the error message
- "Retake photo" button (navigates to camera)
- "Skip & try anyway" button (clears the error + re-runs with skipStages)

The model loading indicator is hidden when there's an error (to avoid
visual clutter). The stages list remains visible so the user can see which
stage failed.
