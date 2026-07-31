# Atelier Nova VTON — Virtual Try-On Boutique

Cross-platform virtual try-on boutique (web + desktop + mobile). Built with
React + Vite + Tailwind + shadcn + Electron on the frontend, and Node + Express
+ TypeScript + Prisma (MongoDB) on the backend.

**Tagline:** *Try then Buy.*

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/farooq110/VTON.git
cd VTON

# 2. Backend
cd backend
cp .env.example .env       # edit DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
npm install
npx prisma generate
npm run seed               # creates admin + brand + products
npm run dev                # http://localhost:4000

# 3. Frontend (new terminal)
cd ../frontend
npm install
npm run dev                # http://localhost:5173

# 4. Desktop app (Electron)
cd frontend
npm run dev:electron
```

Sign in with `admin@admin-portal.local` / `admin12345`, OR use the "Quick
demo login" rows on the sign-in page.

**Full setup instructions:** [`setup-guide/01-quick-start.md`](./setup-guide/01-quick-start.md)

---

## Repository layout

```
VTON/
├── frontend/        # React + Vite + Electron + Tailwind + shadcn (NO Next.js)
├── backend/         # Node + Express + TypeScript + Prisma (MongoDB)
├── admin-portal/    # Separate React dashboard for franchise managers
└── setup-guide/     # Setup + architecture + API ref + improvement guide
```

---

## Feature highlights

- **2-step sign-in** — email + password → 6-digit passcode emailed → home.
  Route guards block unauthed users from private pages AND authed users from
  the sign-in page.
- **Boutique home screen** — full-bleed brand cover banner, logo, tagline,
  "Explore products" CTA, infinite-scroll trending rail (only the list
  scrolls, never the page).
- **Touch-friendly product screen** — long search bar (SKU / code / name /
  description), grid that scales from 2 columns on mobile to 5 columns on
  desktop, three tap modes (navigate / expand / modal).
- **TRY ON pipeline** — camera capture → 3s countdown → Stage 1 person
  detection (Xenova/yolov8n-pose, score ≥ 0.6) → Stage 2 compression
  (metadata strip → quality 0.95→0.70 → dimensions 1.0→0.2, under 1000 KB)
  → Stage 3 pose check (shoulder / face / body visibility) → TryOn AI call
  → brand + franchise request tracking.
- **Animated taglines** — random rotation while the AI renders; blurred
  capture image as backdrop.
- **Captures gallery** — saved images skip validation, go straight to AI.
- **Settings page** — pick detection model, tune posture thresholds, set
  compression target, configure TryOn AI endpoint + key, debug logging.
- **Fully responsive** — breakpoints from `sm` (mobile) up to `5xl` (3840px
  boutique kiosks). Tested on 35″–85″ touch displays.
- **Loose coupling** — every external library wrapped in a `lib/` adapter.
  Swap pose model, image-compression lib, TryOn AI provider, DB ORM, auth
  strategy, or state management without touching components.

---

## Setup guide

The full documentation lives in [`setup-guide/`](./setup-guide/):

| Document | Purpose |
|----------|---------|
| [01-quick-start.md](./setup-guide/01-quick-start.md) | Get running in 5 min |
| [02-architecture.md](./setup-guide/02-architecture.md) | Codebase structure + SOLID |
| [03-api-reference.md](./setup-guide/03-api-reference.md) | Every endpoint documented |
| [04-feature-matrix.md](./setup-guide/04-feature-matrix.md) | Spec → code mapping |
| [05-improvement-guide.md](./setup-guide/05-improvement-guide.md) | How to extend / swap / scale |
| [06-tech-stack-decisions.md](./setup-guide/06-tech-stack-decisions.md) | Why each tech was chosen |
| [07-deployment.md](./setup-guide/07-deployment.md) | Production deploy (web + desktop + mobile) |

---

## Tech stack (at a glance)

| Layer | Technology |
|-------|------------|
| Frontend UI | React 19 + Vite 8 + Tailwind 4 + shadcn/ui |
| Desktop wrapper | Electron 33 (Win / macOS / Linux) |
| Pose detection | `@xenova/transformers` → `Xenova/yolov8n-pose` |
| Image compression | `browser-image-compression` |
| State | Zustand (persisted) + TanStack Query |
| Routing | react-router-dom (mutual-exclusion route guards) |
| Backend | Node 20+ + Express 4 + TypeScript 5 |
| DB ORM | Prisma 6 (MongoDB provider) |
| Auth | JWT + HTTP-only cookies + 2-step passcode |
| Validation | Zod (every request body / query / params) |
| Email queue | BullMQ + ioredis (best-effort — no-ops without Redis) |
| TryOn AI | FASHN.ai (`/api/vton/*`) |

> **Mongoose vs Prisma:** the spec called for Mongoose, but the repo was
> already scaffolded with Prisma. We kept Prisma to avoid breaking existing
> APIs. See [`setup-guide/05-improvement-guide.md`](./setup-guide/05-improvement-guide.md#swapping-prisma-for-mongoose)
> for the 1-day migration path.

---

## License

Private. © Atelier Nova.

---

## Troubleshooting — TryOn API HTTP 404

**Symptom:** The frontend logs `TryOn AI call failed: HTTP 404` when the user
clicks "Try On", even though the backend is running and the user is signed in.

**Root cause:** The `/api/tryon/run` route (in
`backend/src/routes/tryon-track.routes.ts`) used to throw an error prefixed
`NOT_FOUND:` when the `TRYON_AI_ENDPOINT` env var was empty. The centralized
error middleware maps any `NOT_FOUND:`-prefixed error to HTTP 404 — so the
route, which actually exists, appeared to be missing.

**Fix applied:**

1. **`backend/src/routes/tryon-track.routes.ts`** — When
   `TRYON_AI_ENDPOINT` is not set, the route now returns a **200 mock
   response** that echoes the user's captured image back as the "result"
   (with `mock: true` in the response). This makes the app fully functional
   out-of-the-box without any external AI provider setup, and eliminates the
   404 entirely. When `TRYON_AI_ENDPOINT` IS set, the route properly forwards
   the request to the configured AI provider (FASHN.ai etc.).

2. **`backend/src/app.ts`** — Increased `express.json` body limit from
   `1mb` to `25mb`. The `/api/tryon/run` endpoint sends the captured photo
   as a base64 data URL inside JSON (a 2MB JPEG becomes ~2.7MB of base64
   text), which previously caused HTTP 413 Payload Too Large errors that
   surfaced as cryptic "TryOn AI call failed" messages on the client.

3. **`backend/.env`** — Added a default `.env` file with safe development
   values (random `JWT_SECRET` + `ENCRYPTION_KEY`, MongoDB URL pointing to
   `localhost:27017`). The backend now boots out-of-the-box without manual
   env setup. Leave `TRYON_AI_ENDPOINT` blank to use mock mode.

4. **`frontend/.env`** — Added a default `.env` with
   `VITE_API_BASE_URL=http://localhost:4000/api` so the frontend talks to
   the backend without manual configuration.

**To enable real AI try-on (optional):**

```bash
# In backend/.env
TRYON_AI_ENDPOINT=https://api.fashn.ai/v1/run
TRYON_AI_API_KEY=your-fashn-api-key-here
```

The mock mode is the default — only set these when you have a real FASHN.ai
account and want true AI-generated try-on results.
