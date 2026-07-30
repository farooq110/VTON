# Frontend Setup Guide — Atelier Nova (React + Vite + Electron)

Complete guide to install, run, build, and deploy the Atelier Nova frontend.

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 18.18+ | JavaScript runtime |
| npm | 9+ | Package manager |
| Modern browser | Chrome 90+ / Firefox 88+ / Safari 14+ | Camera + Web Worker + WASM |
| Webcam | Any | For try-on camera |
| (Optional) Git | 2.30+ | Version control |

---

## 1. Install

```bash
cd frontend
npm install
```

This installs:
- React 18 + React Router v6 + Vite 5
- Tailwind CSS 3 + shadcn-style UI primitives
- Zustand (persisted state) + TanStack Query (server state)
- `@xenova/transformers` (real YOLOv8n-pose model, lazy-loaded)
- `browser-image-compression` (Stage 2 compression, uses Web Worker)
- Framer Motion (animations) + Lucide React (icons)
- Electron 32 (desktop wrapper)

---

## 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Backend API URL (required — point to your backend server)
VITE_API_BASE_URL=http://localhost:4000/api

# TryOn AI provider (optional — leave blank for mock)
VITE_TRYON_API_ENDPOINT=
VITE_TRYON_API_KEY=

# Brand + franchise identifiers
VITE_BRAND_ID=brnd_atelier_nova
VITE_FRANCHISE_ID=frnch_global
```

> **Important**: All client-exposed env vars MUST start with `VITE_`. Without
> the prefix, Vite won't inline them into the browser bundle.

---

## 3. Run in dev mode (web)

```bash
npm run dev
```

Open **http://localhost:5173** in your browser. Hot Module Reload (HMR) is
active — most code changes appear instantly without a page refresh.

---

## 4. Run in dev mode (desktop / Electron)

```bash
npm run dev:electron
```

This starts the Vite dev server AND launches Electron in a single command.
The Electron window loads `http://localhost:5173` with hot reload.

---

## 5. Build for production (web)

```bash
npm run build
```

Outputs to `dist/`. Deploy this folder to any static host:
- Vercel: `vercel --prod`
- Netlify: `netlify deploy --prod --dir=dist`
- Nginx: copy `dist/` to your web root
- S3 + CloudFront: `aws s3 sync dist/ s3://your-bucket/`

Preview the production build locally:
```bash
npm run preview
```

---

## 6. Build desktop installer (Electron)

```bash
npm run build:electron
```

Produces installers in `dist-electron/`:

| Platform | Output file |
|---|---|
| Windows | `Atelier Nova Setup 1.0.0.exe` |
| macOS | `Atelier Nova-1.0.0.dmg` |
| Linux | `Atelier Nova-1.0.0.AppImage` |

### Code signing (production)

**macOS:**
```bash
export CSC_LINK="path/to/developer-id-application.p12"
export CSC_KEY_PASSWORD="your-password"
npm run build:electron
```

**Windows:**
```bash
set CSC_LINK=path\to\certificate.pfx
set CSC_KEY_PASSWORD=your-password
npm run build:electron
```

---

## 7. Kiosk mode (franchise stores)

For kiosk deployment, the app auto-signs-in as `public_user` on launch —
no sign-in screen, no logout button, no settings access.

Set environment variables before building:

```bash
ELECTRON_KIOSK_MODE=true \
ELECTRON_KIOSK_USER=nyc.user@atelier.nova \
ELECTRON_KIOSK_PASSWORD=user123 \
npm run build:electron
```

The kiosk app:
- Auto-launches fullscreen (no window chrome)
- Auto-signs-in as public_user
- Hides logout button + settings button + role badge
- Manager exits by **long-pressing the brand logo (1.5 seconds)** on the home screen

### Auto-launch on boot

- **Windows**: Add shortcut to `shell:startup`
- **macOS**: System Preferences → Users & Groups → Login Items
- **Linux**: Add `.desktop` file to `~/.config/autostart/`

---

## 8. Demo credentials

| Email | Password | Role | Access |
|---|---|---|---|
| `admin@atelier.nova` | `admin123` | super_admin | Everything |
| `developer@atelier.nova` | `dev123` | developer | Feature settings + activity log |
| `nyc.manager@atelier.nova` | `manager123` | manager | Brand identity settings |
| `nyc.user@atelier.nova` | `user123` | public_user | Browse + try-on (kiosk) |
| `lax.manager@atelier.nova` | `manager123` | manager | Brand identity settings |
| `lax.user@atelier.nova` | `user123` | public_user | Browse + try-on (kiosk) |

---

## 9. Project structure

```
frontend/
├── src/
│   ├── main.tsx                    # Vite entry — mounts <App />
│   ├── App.tsx                     # Router with lazy-loaded screens
│   ├── index.css                   # Tailwind + boutique theme
│   ├── components/
│   │   ├── ErrorBoundary.tsx       # Global error boundary
│   │   ├── layout/
│   │   │   ├── GlobalHeader.tsx    # Shared header with hamburger menu
│   │   │   └── BrandHeader.tsx     # Logo lockup
│   │   ├── products/
│   │   │   └── ProductCard.tsx     # Shared product tile (expand-on-click)
│   │   ├── home/
│   │   │   └── TrendingProducts.tsx # Infinite-scroll rail
│   │   ├── settings/
│   │   │   └── BrandSection.tsx    # Manager brand identity controls
│   │   ├── tryon/
│   │   │   ├── AddCapturePanel.tsx  # Upload + 3-stage validation
│   │   │   └── ActivityLogPanel.tsx # Floating debug overlay
│   │   └── ui/                     # shadcn-style primitives (13 files)
│   ├── hooks/
│   │   ├── useAuth.ts              # TanStack Query auth mutations
│   │   ├── useProducts.ts          # TanStack Query catalog queries
│   │   ├── useCamera.ts            # getUserMedia wrapper
│   │   ├── usePoseDetection.ts     # @xenova/transformers YOLOv8n-pose
│   │   ├── useImageCompression.ts  # browser-image-compression (Web Worker)
│   │   ├── useTryOnOrchestrator.ts # 5-stage pipeline coordinator
│   │   ├── useTaglineRotation.ts   # Animated tagline rotation
│   │   └── useHiddenLogout.ts      # Kiosk hidden logout (long-press)
│   ├── lib/
│   │   ├── api-client.ts           # Axios instance (baseURL + 401 interceptor)
│   │   ├── store.ts                # Zustand store (persisted)
│   │   ├── constants.ts            # Detection models + default settings
│   │   ├── utils.ts                # cn, formatPrice, formatBytes, etc.
│   │   └── taglines.ts             # Tagline strings
│   ├── pages/
│   │   ├── SignInPage.tsx
│   │   ├── PasscodePage.tsx
│   │   ├── HomePage.tsx            # Cover + trending rail + menu
│   │   ├── ProductsPage.tsx        # Grid with shared ProductCard
│   │   ├── ProductDetailPage.tsx
│   │   ├── NewArrivalsPage.tsx
│   │   ├── TryOnCameraPage.tsx     # Camera + auto-close + confirmation modal
│   │   ├── TryOnProcessingPage.tsx # 5-stage tracker
│   │   ├── TryOnResultPage.tsx     # Full-screen + slide-in details
│   │   ├── CapturesGalleryPage.tsx # Select mode + preview + delete
│   │   └── SettingsPage.tsx        # Brand (manager) + Features (developer)
│   └── types/
│       └── index.ts                # All interfaces + RBAC helpers
├── electron/
│   ├── main.ts                     # Electron main process
│   ├── preload.ts                  # Context bridge
│   └── tsconfig.json
├── public/                         # Static assets
├── index.html                      # Vite HTML entry
├── vite.config.ts                  # @ alias + worker + chunk splitting
├── tailwind.config.ts
├── package.json
├── tsconfig.json
└── SETUP.md                        # This file
```

---

## 10. Key features

- **4 roles** with RBAC: super_admin, developer, manager, public_user
- **Real YOLOv8n-pose** person detection via `@xenova/transformers` (lazy-loaded, cached)
- **3-stage validation pipeline**: person detection → compression → pose check
- **Web Worker** for image analysis (off-main-thread)
- **Infinite scroll** trending products rail (32-item pool)
- **Hamburger menu** on home page (slide-down nav, all screen sizes)
- **Hidden logout** for kiosk mode (long-press brand logo 1.5s)
- **Activity log** overlay (developer+ only, select mode + copy/delete)
- **Brand identity management** (manager uploads custom cover/name/logo)
- **Captures gallery** with select mode + per-card preview + delete
- **AddCapturePanel** with disk upload + URL paste + 3-stage validation
- **Lazy-loaded** screens via React.lazy + Suspense
- **Global ErrorBoundary** with friendly reload UI
- **Camera auto-close** on tab switch, window blur, sidebar open, modal open
- **Try-on confirmation modal** with centered image preview
- **Shared ProductCard** component (reused by ProductsPage + TrendingProducts)

---

## 11. Scripts reference

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server (http://localhost:5173) |
| `npm run dev:electron` | Start Vite + Electron concurrently (desktop dev) |
| `npm run build` | Production build → `dist/` |
| `npm run build:electron` | Build desktop installer → `dist-electron/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript check (no emit) |

---

## 12. Troubleshooting

### Camera doesn't open
- Make sure no other app is using the webcam
- Check browser permissions (chrome://settings/content/camera)
- `getUserMedia` requires HTTPS or localhost
- In Electron, ensure `contextIsolation: true` in webPreferences

### @xenova/transformers model download fails
- The YOLOv8n-pose model (~3.2 MB) downloads from HuggingFace on first try-on
- Check internet connection + firewall
- The app falls back to content-based analysis if the model can't load
- Check console for: `[usePoseDetection] @xenova/transformers failed to load`

### CORS errors
- Ensure `VITE_API_BASE_URL` points to the correct backend URL
- Backend `CORS_ORIGIN` must include `http://localhost:5173`

### Build fails
- Run `npm run typecheck` to see TypeScript errors
- Ensure all imports use `@/` alias (configured in `vite.config.ts` + `tsconfig.json`)
- Delete `node_modules` + `package-lock.json` and re-install if cache is stale

### Electron window is blank
- Check that Vite dev server is running on port 5173
- Open DevTools in Electron: `Ctrl+Shift+I` (Windows) or `Cmd+Option+I` (Mac)
- Check console for errors
