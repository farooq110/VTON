# Atelier Nova — Frontend (React + Vite + Tailwind + Electron)

Production frontend for the **Try then Buy** virtual try-on boutique.
Multi-platform: runs as a web app, an Electron desktop app (Win/macOS/Linux), and is responsive from mobile up to 85″ boutique kiosks.

## Tech stack (strict)

| Concern | Library |
|---|---|
| UI framework | React 18 |
| Build tool | Vite 5 |
| Styling | Tailwind CSS 3 + hand-written shadcn-style primitives |
| State | Zustand (persisted) + TanStack Query (server state) |
| Routing | React Router v6 |
| Pose detection | `@xenova/transformers` (lazy-loaded, model cached per session) |
| Image compression | `browser-image-compression` (Stage 2 spec) |
| HTTP | axios (centralised in `src/lib/api-client.ts`) |
| Desktop wrapper | Electron 32 |

> **No Next.js.** The same React tree runs in the browser and inside Electron.

## Project structure

```
frontend/
├── electron/             # Electron main + preload (multi-platform)
├── src/
│   ├── components/       # UI primitives + feature components (small, SRP)
│   ├── hooks/            # useCamera, useImageCompression, usePoseDetection,
│   │                     # useTaglineRotation, useTryOnOrchestrator, useAuth, useProducts
│   ├── lib/              # api-client, store (Zustand), utils, taglines, constants
│   ├── pages/            # Route-level thin wrappers
│   ├── types/            # Shared interfaces
│   ├── App.tsx           # Router with mutual-exclusion guards
│   ├── main.tsx          # React root
│   └── index.css         # Tailwind + boutique theme
├── tailwind.config.ts
├── vite.config.ts        # base: "./" for Electron file:// loading
└── package.json
```

## SOLID principles applied

- **Single Responsibility**: every hook does one thing (camera, compression, pose, taglines, orchestration). Every component is small.
- **Open/Closed**: `DETECTION_MODELS` in `src/lib/constants.ts` is the only place to register new models — no UI changes needed.
- **Liskov**: all detection models implement the same `(image, modelId) → PersonDetectionResult` contract via `usePoseDetection`.
- **Interface Segregation**: `useTryOnOrchestrator` only depends on the three hook interfaces it consumes.
- **Dependency Inversion**: orchestrator never imports Xenova or browser-image-compression directly — only through `usePoseDetection` / `useImageCompression`. Swap either without touching the orchestrator.

## Loosely coupled swap points

| Swap | Where |
|---|---|
| Pose model | `usePoseDetection.ts` → `MODEL_REPO` map |
| Compression lib | `useImageCompression.ts` → `imageCompression(...)` calls |
| HTTP client | `src/lib/api-client.ts` (axios) |
| State store | `src/lib/store.ts` (Zustand) — interface is stable |
| UI primitives | `src/components/ui/*` (re-roll any component independently) |
| Electron bridge | `electron/preload.ts` exposes only `window.nova.*` |

## Getting started

```bash
# 1. Install
npm install

# 2. Configure backend URL
cp .env.example .env
# edit VITE_API_BASE_URL to point at your backend

# 3. Dev (web)
npm run dev
# open http://localhost:5173

# 4. Dev (Electron desktop)
npm run dev:electron

# 5. Production build
npm run build

# 6. Build desktop installers (Win/macOS/Linux)
npm run build:electron
# output in release/
```

## Responsive design

The same Tailwind stylesheet scales root font-size up at 2560/3840/5120 px breakpoints so the boutique UI is comfortable on 35″–85″ kiosk displays without rewriting layouts.

| Breakpoint | Root font | Target |
|---|---|---|
| < 2560 px | 16 px | Mobile, desktop, Electron window |
| 2560–3839 px | 18 px | 27″–32″ screens |
| 3840–5119 px | 22 px | 43″–55″ 4K kiosks |
| ≥ 5120 px | 28 px | 65″–85″ 5K/8K displays |

## Try-on pipeline (spec compliance)

The full spec'd pipeline runs in `useTryOnOrchestrator`:

1. **Stage 1 — Person detection** (`Xenova/yolov8n-pose`, score 0.60)
2. **Stage 2 — Compression** (`browser-image-compression`)
   - If ≤ 1000 KB → strip metadata + chunks only.
   - If > 1000 KB → reduce quality by 5% per cycle until target hit.
   - Below 70% quality → reduce dimensions by 5% per cycle.
3. **Stage 3 — Pose check** (same model)
   - Shoulders straight, face straight, body visible (top-to-knee acceptable).
4. **AI call** to configurable TryOn AI endpoint.
5. **Brand tracking** — POST to `/api/tryon/track` with `brandId + franchiseId + userId + productSku`.

Saved captures skip stages 1–3 (only AI + tracking run).

## Sign-in flow

1. User enters email + password → POST `/api/auth/signin` → backend emails a 6-digit passcode.
2. User enters passcode → POST `/api/auth/verify-passcode` → backend returns JWT + user.
3. JWT stored in `localStorage` and auto-attached by `apiClient` interceptor.
4. 401 → auto-signout + redirect to `/signin`.
5. Route guards in `App.tsx` keep auth pages and private pages mutually exclusive.

## Electron notes

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Renderer accesses privileged operations only through `window.nova.*` (preload bridge).
- External links open in OS browser, never inside Electron.
- Kiosk mode toggle available via `window.nova.toggleFullscreen()` for boutique displays.

## Adding a new detection model

1. Add the entry to `DETECTION_MODELS` in `src/lib/constants.ts` (id, name, description, size, speed, accuracy, recommended).
2. Add the Hugging Face repo to `MODEL_REPO` in `src/hooks/usePoseDetection.ts`.
3. Done — Settings screen will surface it automatically.
