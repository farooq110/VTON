# 01 — Quick Start

Get the Atelier Nova VTON app running on your machine in 5 minutes.

## Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Node.js | ≥ 20 LTS | Backend + frontend runtime |
| npm | ≥ 10 | Package manager (bun / pnpm also work) |
| MongoDB | ≥ 6.0 | Database (local install OR MongoDB Atlas free tier) |
| Git | ≥ 2.40 | Clone the repo |

Optional (for desktop builds):
- **Electron deps** are bundled — no native build tools required.

## 1. Clone & install

```bash
git clone https://github.com/farooq110/VTON.git
cd VTON
```

Install both projects in parallel:

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env   # then edit values (see step 2)
npm install
npx prisma generate

# Terminal 2 — frontend
cd frontend
npm install
```

## 2. Configure backend env

Edit `backend/.env`:

```bash
# Server
PORT=4000
NODE_ENV=development

# Database — local MongoDB OR Atlas URI
DATABASE_URL="mongodb://localhost:27017/vton?retryWrites=true&w=majority"

# Auth — generate with: openssl rand -hex 32
JWT_SECRET=your-64-char-random-string
JWT_EXPIRES_IN=7d

# Encryption — must be 64-char hex (32 bytes) for AES-256-GCM
# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Redis (optional — BullMQ no-ops if unreachable)
REDIS_URL=redis://localhost:6379

# CORS (comma-separated list of allowed origins)
CORS_ORIGIN=http://localhost:5173,http://localhost:5174

# FASHN.ai (the actual try-on AI)
FASHN_API_BASE_URL=https://api.fashn.ai
```

## 3. Seed the database (creates demo admin + brand + products)

```bash
cd backend
npm run seed
```

This creates:
- Admin user: `admin@admin-portal.local` / `admin12345`
- Default brand: **Atelier Nova** with tagline "Try then Buy"
- 8 dummy products (Anarkali, Shalwar Kameez, Lehenga, etc.)
- 5 demo customers with franchises, API keys, pricing, invoices

## 4. Run the backend

```bash
cd backend
npm run dev    # starts on http://localhost:4000
```

You should see:
```
✅ Server ready: http://localhost:4000
✅ Database: connected
```

## 5. Run the frontend

In a new terminal:

```bash
cd frontend
npm run dev    # starts on http://localhost:5173
```

Open `http://localhost:5173` → you should see the sign-in page.

## 6. Sign in (two options)

### Option A — 2-step sign-in with passcode (production flow)
1. Enter `admin@admin-portal.local` and `admin12345`.
2. Click **Continue** — the backend emails a 6-digit passcode.
3. In dev mode the passcode is also shown in the UI ("Dev mode: code is 123456").
4. Enter the 6-digit code → click **Sign in** → redirected to `/home`.

### Option B — Quick demo login (skips passcode)
Tap any of the demo credential rows on the sign-in page:
- `admin@atelier.nova` / `admin123` (Super Admin)
- `developer@atelier.nova` / `dev123` (Developer)
- `nyc.manager@atelier.nova` / `manager123` (Manager)
- `nyc.user@atelier.nova` / `user123` (Public User)

> Note: demo credentials live in the seed file — replace them with real admin
> accounts before production.

## 7. Run as a desktop app (Electron)

```bash
cd frontend
npm run dev:electron
```

This launches the Vite dev server AND the Electron app side-by-side. The
Electron window loads `http://localhost:5173`.

To build a distributable desktop binary:
```bash
npm run build:electron
# Output: frontend/release/*.dmg (mac) / *.exe (win) / *.AppImage (linux)
```

## 8. Try a virtual try-on

1. From `/home`, click **Explore products**.
2. Tap any product → tap **TRY ON**.
3. Grant camera permission.
4. Stand in frame → click **Capture** → 3-second countdown fires.
5. Stage 1 (person detection) → Stage 2 (compression) → Stage 3 (pose check)
   → TryOn AI call → brand tracking.
6. View the result fullscreen → close → try another garment.

> If the FASHN.ai API key isn't set, the orchestrator gracefully falls back
> to a mock result so you can still see the full flow end-to-end.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `MongoServerError: Authentication failed` | Check the username/password in `DATABASE_URL` |
| `Cannot find module '@prisma/client'` | Run `npx prisma generate` in `backend/` |
| Frontend shows `Network Error` on `/brand` | Backend isn't running, or CORS_ORIGIN doesn't include `localhost:5173` |
| Camera permission denied | Use `http://localhost:5173` (not `http://192.168.x.x`) — Chrome blocks camera on insecure origins |
| Pose model download hangs | First load downloads ~3 MB from HF Hub. Set `settings.autoPreloadModel = false` to defer until needed |
| Passcode never arrives | Check Redis is running, or use the dev-mode passcode shown in the UI |

## What's next

- Read [`02-architecture.md`](./02-architecture.md) to understand the codebase layout.
- Read [`03-api-reference.md`](./03-api-reference.md) for every endpoint's contract.
- Read [`04-feature-matrix.md`](./04-feature-matrix.md) to see where each spec'd feature lives.
