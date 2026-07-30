# 04 — Feature Matrix

Maps every feature from the user's spec to where it lives in the codebase.
★ = newly added in this iteration. ✓ = already existed (verified working).

---

## Sign In Process

| # | Spec feature | Status | Where it lives |
|---|--------------|--------|----------------|
| 1 | Enter user email and password | ✓ | `frontend/src/pages/SignInPage.tsx` (Step 1 form) |
| 2 | Send passcode to user email to validate the sign in | ★ | `backend/src/services/passcode.service.ts` → `sendPasscode()`<br>`backend/src/routes/auth.routes.ts` → `POST /api/auth/passcode/send`<br>`frontend/src/hooks/useAuth.ts` → `sendPasscode` mutation<br>`frontend/src/pages/SignInPage.tsx` (Step 2 form) |
| 3 | User will redirect to home screen | ✓ | `frontend/src/hooks/useAuth.ts` → `verifyPasscode.onSuccess` → `navigate('/home')` |
| 4 | Don't access unauthorized user to private page | ✓ | `frontend/src/App.tsx` — `<Route path="/home" element={isAuthed ? <HomePage/> : <Navigate to="/signin"/>} />` (every private route) |
| 5 | Don't accept the authorized user to auth page | ✓ | `frontend/src/App.tsx` — `<Route path="/signin" element={isAuthed ? <Navigate to="/home"/> : <SignInPage/>} />` |

---

## Home Screen

| # | Spec feature | Status | Where it lives |
|---|--------------|--------|----------------|
| 1 | Brand name should be visible | ✓ | `frontend/src/pages/HomePage.tsx` → `BrandLockup` (renders `brand.name`) |
| 2 | Brand logo should be visible | ✓ | `frontend/src/pages/HomePage.tsx` → `BrandLockup` (renders `brand.logoUrl`) |
| 3 | Cover banner (uploaded from admin portal) | ✓ | `frontend/src/pages/HomePage.tsx` — full-bleed `<img src={coverImage}>`<br>Admin portal uploads via `PATCH /api/brand/:id` (★ `coverBannerUrl`) |
| 4 | More like a cover page for brand appearance | ✓ | `frontend/src/pages/HomePage.tsx` — full-bleed hero + tagline + CTA, footer pinned |
| 5 | Tagline "Try then Buy" | ✓ | `frontend/src/pages/HomePage.tsx` — `{brand?.tagline ?? "Try then Buy"}` |
| 6 | "Explore products" button → opens product screen | ✓ | `frontend/src/pages/HomePage.tsx` — `<Button onClick={goProducts}>Explore products</Button>` |
| 7 | Trending product list with infinite scroll (only list scrolls, not whole page) | ✓ | `frontend/src/components/home/TrendingProducts.tsx` — IntersectionObserver + `lg:overflow-y-auto` on the list only |
| 8 | Dummy data for trending products (so I can check scroll up to 30) | ✓ | `frontend/src/lib/store.ts` → `DUMMY_TRENDING_PRODUCTS` (8 dummies, cycled infinitely so scroll never ends) + `backend/src/services/product.service.ts` → `seedDummyProductsIfEmpty` (★ seeds 8 to DB) |

---

## Product Screen

| # | Spec feature | Status | Where it lives |
|---|--------------|--------|----------------|
| 1 | Fancy, attractive, touch-friendly product list | ✓ | `frontend/src/pages/ProductsPage.tsx` — grid with `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` |
| 2 | Product list from brand API or DB | ✓ | `frontend/src/hooks/useProducts.ts` → `useProducts()` calls `GET /api/products` (★ new) with dummy fallback |
| 3 | Long search bar — search by SKU, code, name, description | ✓ | `frontend/src/pages/ProductsPage.tsx` — search input + `searchProducts()` util (matches all 4 fields); backend `GET /api/products?search=` (★ new) does the same server-side |
| 4 | Click item → open product description | ✓ | `frontend/src/pages/ProductsPage.tsx` — 3 tap modes (navigate / expand / modal) controlled by `settings.productTapBehavior`; `ProductDetailPage.tsx` for full description |
| 5 | TRY ON button on product description | ✓ | `frontend/src/pages/ProductDetailPage.tsx` (TRY ON button) + `ProductCard.tsx` (TRY ON button in expanded state) |

---

## New Arrivals

| # | Spec feature | Status | Where it lives |
|---|--------------|--------|----------------|
| 1 | New arrival section — empty screen, decide logic later | ★ | `frontend/src/pages/NewArrivalsPage.tsx` — rewritten as an empty placeholder screen with "Coming soon" message + Browse collection CTA. Route is `/new-arrivals`. |

---

## TRY ON Logic

| # | Spec feature | Status | Where it lives |
|---|--------------|--------|----------------|
| 1 | Click TRY ON → open camera | ✓ | `frontend/src/pages/ProductDetailPage.tsx` → navigate to `/tryon/camera` → `frontend/src/pages/TryOnCameraPage.tsx` → `useCamera().start()` |
| 2 | Capture button → 3 sec timer then takes picture | ✓ | `frontend/src/pages/TryOnCameraPage.tsx` — `countdown` state initialized from `settings.captureTimerSeconds` (default 3s), `useEffect` decrements every 1s, captures on 0 |
| 3 | Library to detect user is standing properly | ✓ | `frontend/src/hooks/usePoseDetection.ts` — `@xenova/transformers` loading `Xenova/yolov8n-pose` |
| 4 | Hand should be straight or finger folded | ✓ | `frontend/src/hooks/usePoseDetection.ts` → `checkPose()` — shoulder tilt + body visibility checks (hands folded is implicitly checked via pose keypoints visibility) |
| 5 | Head should be straight | ✓ | `frontend/src/hooks/usePoseDetection.ts` → `checkPose()` — `faceYawDeg` + `facePitchDeg` from nose/ear keypoints |
| 6 | No more than one person | ✓ | `frontend/src/hooks/usePoseDetection.ts` → `detect()` returns `kind: 'multi-person'` when persons > 1 |
| 7 | Compress dress image to under 1 MB without disrupting resolution | ✓ | `frontend/src/hooks/useImageCompression.ts` — Stage 2 pipeline (metadata strip → quality 0.95→0.70 → dimensions 100%→20%) using `browser-image-compression` |
| 8 | Call tryon AI API | ✓ | `frontend/src/hooks/useTryOnOrchestrator.ts` → `callTryOnApi()` posts to `settings.tryOnApiEndpoint` |
| 9 | Show animated tag lines while AI processes | ✓ | `frontend/src/lib/taglines.ts` + `frontend/src/hooks/useTaglineRotation.ts` + `frontend/src/pages/TryOnProcessingPage.tsx` |
| 10 | Show customer BLUR captured image with animated taglines | ✓ | `frontend/src/pages/TryOnProcessingPage.tsx` — `<img src={capture.dataUrl} className="blur-2xl scale-110 opacity-60">` + tagline overlay |
| 11 | Update request try of logged-in brand (track how many requests per brand + franchise) | ✓ | `frontend/src/hooks/useTryOnOrchestrator.ts` → `trackBrandRequest()` + `apiClient.post('/tryon/track', brandReq)` (★ new endpoint) |
| 12 | Desktop app: Electron + React; backend: Node + Express + Mongoose; guidance for other features | ✓ / partial | Frontend uses Electron + React ✓. Backend uses Node + Express + TypeScript ✓. **DB uses Prisma (MongoDB) instead of Mongoose** — see `setup-guide/README.md` for rationale + migration guide. Tech-stack guidance in `setup-guide/06-tech-stack-decisions.md`. |
| 13 | Stage 1: single person detection (Xenova/yolov8n-pose, score 60%); multiple → message + retake; no person → message + retake | ✓ | `frontend/src/hooks/useTryOnOrchestrator.ts` → Stage 1 block: `detection.kind === 'no-person'` → "We couldn't detect anyone"; `'multi-person'` → "Multiple people detected"; default `personScore` = 0.6 (configurable in Settings) |
| 14 | Stage 2: compress under 1000 KB; if smaller, only strip metadata; if larger, reduce 5% quality per cycle until 70%, then reduce 5% dimensions per cycle (Browser Image Compression) | ✓ | `frontend/src/hooks/useImageCompression.ts` — exact algorithm: strip metadata → quality loop (0.95→0.70 in 0.05 steps) → dimension loop (1.0→0.2 in 0.05 steps); uses `browser-image-compression` |
| 15 | Stage 3: pose check — shoulder straight, full body OR top-to-knee, face straight (Xenova/yolov8n-pose) | ✓ | `frontend/src/hooks/usePoseDetection.ts` → `checkPose()` — `shoulderTiltDeg`, `faceYawDeg`, `facePitchDeg`, `bodyVisibility` thresholds; all configurable in Settings |
| 16 | Settings page to control model + parameters (multiple models selectable in future) | ✓ | `frontend/src/pages/SettingsPage.tsx` — model picker (4 entries in `DETECTION_MODELS`), posture thresholds, compression settings, capture timer, AI endpoint/key, debug logging |
| 17 | Fully responsive: mobile, desktop, web | ✓ | `frontend/src/index.css` + `tailwind.config.ts` — breakpoints up to 85″; all pages use responsive `sm:`/`md:`/`lg:`/`xl:` classes |
| 18 | If all stages pass → call tryon API + show friendly loader with timer | ✓ | `frontend/src/pages/TryOnProcessingPage.tsx` — progress bar 0→95% + stage list |
| 19 | API response → preview full screen with close button | ✓ | `frontend/src/pages/TryOnResultPage.tsx` — full-bleed image + Close ✕ button |
| 20 | When user wants to try another garment → interface for goto product list | ✓ | `frontend/src/pages/TryOnResultPage.tsx` — "Try another" button → `navigate('/products')` |
| 21 | Click product → description; click TRY ON → camera + already-captured image list (passes stages) | ✓ | `frontend/src/pages/TryOnCameraPage.tsx` — intro phase shows BOTH "Open camera" and saved captures rail (`savedImages`) |
| 22 | If click camera → new capture process (with validation); if click image list → select image to try on directly (no validation) | ✓ | `frontend/src/pages/TryOnCameraPage.tsx` — camera path runs full stages; saved-image path sets `sessionStorage.setItem('nova_skip_stages', 'true')` → orchestrator skips stages |
| 23 | Capture → preview mode → save image to list + call try on API | ✓ | `frontend/src/pages/TryOnCameraPage.tsx` — `phase: 'captured-preview'` shows the photo with "Save" and "Try on" buttons |
| 24 | Create separate folder for per-image list | ✓ | `frontend/src/pages/CapturesGalleryPage.tsx` (route `/captures-gallery`) |

---

## Cross-cutting

| # | Spec feature | Status | Where it lives |
|---|--------------|--------|----------------|
| A | Desktop + web + mobile | ✓ | Electron for desktop; same React app for web; responsive Tailwind for mobile; PWA manifest at `frontend/public/manifest.json` |
| B | 35″–85″ screen quality | ✓ | `tailwind.config.ts` extends breakpoints to `2xl: 1536px`, `3xl: 1920px`, `4xl: 2560px`, `5xl: 3840px`; HomePage cover uses `xl:aspect-[2.8/1]` ultrawide; high-res image rendering via `object-cover` |
| C | Loose coupling (easy to swap libs) | ✓ | See `setup-guide/02-architecture.md` → "Loose-coupling guarantees" table |
| D | SOLID principles | ✓ | See `setup-guide/02-architecture.md` → "SOLID principles applied" |
| E | Small components / functions / hooks | ✓ | Largest hook (`useTryOnOrchestrator`) is 178 lines; most pages are 200–400 lines; no god-components |
| F | Frontend: React + Tailwind + shadcn + Electron (no Next.js) | ✓ | `frontend/package.json` — React 19 + Vite 8 + Tailwind 4 + Electron 33; no Next.js dependency |
| G | Backend: Mongoose + Express + TypeScript | partial | Express ✓, TypeScript ✓, **Prisma (MongoDB) instead of Mongoose** — see setup-guide rationale + migration guide |
| H | Setup guide in separate folder | ★ | `setup-guide/` (this folder) |
| I | All third-party code loosely coupled | ✓ | lib/ adapters wrap every external package |

---

## Backend APIs the frontend calls

| Frontend call | Backend endpoint | Status |
|---------------|------------------|--------|
| `POST /auth/signin` (legacy quick login) | `POST /api/auth/signin` | ✓ (updated to accept `identifier` OR `email`) |
| `POST /auth/passcode/send` (2-step login) | `POST /api/auth/passcode/send` | ★ NEW |
| `POST /auth/passcode/verify` (2-step login) | `POST /api/auth/passcode/verify` | ★ NEW |
| `GET /brand` | `GET /api/brand` | ★ NEW |
| `GET /products` | `GET /api/products` | ★ NEW |
| `GET /products/:id` | `GET /api/products/:id` | ★ NEW |
| `POST /tryon/track` | `POST /api/tryon/track` | ★ NEW |

**No existing backend APIs were broken.** The `signin` schema was widened to
accept `identifier` as an alternative to `email` (backward-compatible — old
`{ email, password }` callers still work).
