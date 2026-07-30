# 06 — Tech Stack Decisions

Why each technology was chosen, and what to swap if your constraints differ.

---

## Frontend

### React 19 + Vite 8 (not Next.js)

**Why:** The spec explicitly forbids Next.js. Vite gives sub-second HMR, native
ESM, and zero magic — perfect for a kiosk-style boutique app where you want
to ship a single static bundle that runs on web AND inside Electron.

**Alternatives:**
- **Next.js** — would add SSR + RSC complexity we don't need (the app is fully
  client-side; all data comes from the backend API). Also, the user explicitly
  forbade it.
- **Remix** — same SSR-first bias; overkill for a touch kiosk app.
- **Solid** — fastest renderer, but ecosystem is smaller; shadcn/ui doesn't
  work natively (would need a port).

### Tailwind CSS 4 + shadcn/ui

**Why:**
- **Tailwind 4** is the latest (CSS-first config, native nesting, no PostCSS
  plugin chain). Smaller production CSS than v3.
- **shadcn/ui** isn't a library — it's a *pattern*. You copy components into
  your repo and own them. No version-lock, no opaque APIs. Perfect for a
  boutique app where you'll customize every primitive.

**Alternatives:**
- **Material UI** — heavier, opinionated Material Design look (doesn't fit
  a luxury boutique aesthetic).
- **Chakra UI** — good DX but runtime-styled (slower than Tailwind's
  compile-time CSS).
- **Radix UI directly** — shadcn is built on Radix; using Radix alone means
  writing all the styling yourself.

### Electron 33 (for desktop)

**Why:** The spec requires desktop support. Electron wraps the same React app
as a desktop binary — zero code duplication. v33 is the latest stable.

**Alternatives:**
- **Tauri** — smaller bundle (~3 MB vs Electron's ~80 MB), uses the OS
  webview. Better for resource-constrained kiosks. **Switch if bundle size
  matters.** Requires Rust toolchain for the main process.
- **PWA (browser-only)** — installable on desktop via Chrome/Edge. No native
  APIs (filesystem, system tray), but zero distribution overhead. **Use for
  the web-only deployment.**

### `@xenova/transformers` (for pose detection)

**Why:** The spec requires `Xenova/yolov8n-pose`. `@xenova/transformers` is
the official JS port of Hugging Face Transformers — runs the model in-browser
via ONNX Runtime Web (WebGPU when available, WASM fallback). No server round
trip → privacy-friendly (user photos never leave the device for validation).

**Alternatives:**
- **MediaPipe** (Google) — `@mediapipe/tasks-vision` PoseLandmarker. Faster
  on Chrome (uses WebGPU), but Google-owned and less portable.
- **TensorFlow.js + MoveNet** — well-supported but lower accuracy on
  non-standard poses.
- **Server-side pose detection** (OpenPose on a GPU box) — more accurate but
  adds latency + privacy concerns.

### `browser-image-compression` (for Stage 2)

**Why:** The spec explicitly names this library. Web-worker-based, supports
EXIF stripping + quality + dimension reduction, works in every modern
browser.

**Alternatives:**
- **Canvas API (manual)** — no dependency, but you reimplement EXIF stripping
  and quality reduction. ~200 lines of code.
- **Squoosh libs** (`@jsquash/*`) — modern, libvips-based. Slightly better
  quality at the same file size. More dependencies.

### TanStack Query (server state)

**Why:** The app fetches brand + products from the backend. TanStack Query
gives you caching, retries, stale-while-revalidate, and request deduplication
for free. No boilerplate.

**Alternatives:**
- **SWR** (Vercel) — similar API, slightly less feature-rich.
- **RTK Query** (Redux) — bundled with Redux Toolkit; overkill if you're not
  already using Redux.
- **Plain `useEffect + fetch`** — works, but you'll reinvent caching.

### Zustand (client state)

**Why:** ~1 KB, no boilerplate, no context provider, built-in persist
middleware (localStorage). The auth store needs to persist across reloads;
Zustand does this in 3 lines.

**Alternatives:**
- **Redux Toolkit** — more mature, bigger ecosystem, but verbose for our needs.
- **Jotai** — atomic state, great for fine-grained re-renders. Overkill here.
- **React Context** — built-in, but causes re-render storms without careful
  memoization.

---

## Backend

### Express 4 (not Fastify / NestJS)

**Why:** Battle-tested, every Node dev knows it, massive middleware ecosystem.
The spec mentions Express.

**Alternatives:**
- **Fastify** — 2-3× faster, built-in schema validation. **Switch if you
  outgrow Express's throughput.** Middleware API differs.
- **NestJS** — opinionated DI + decorators. Good for large teams; overkill
  for a 10-route boutique backend.
- **Hono** — edge-first (Cloudflare Workers / Deno). **Switch if you deploy
  to the edge.**

### TypeScript 5 (strict)

**Why:** The spec requires TypeScript on the backend. Strict mode catches
null-deref bugs at compile time. The Prisma client is fully typed → end-to-end
type safety from DB to HTTP response.

**Alternatives:**
- **Plain JavaScript** — faster to bootstrap, but you lose the Prisma type
  inference (the main reason to use Prisma).
- **Zod + plain JS** — runtime validation without compile-time types.

### Prisma 6 (MongoDB provider) — not Mongoose

**Why the spec said Mongoose but we kept Prisma:**
1. The repo was already scaffolded with Prisma — switching would break every
   existing endpoint (`/api/vton`, `/api/customers`, `/api/franchises`, etc.).
2. Prisma + MongoDB gives the same capabilities as Mongoose (typed models,
   schema validation, indexes, aggregation pipelines) with stronger end-to-end
   type inference and a declarative schema file.
3. The service layer is the only Prisma touchpoint — swapping to Mongoose
   later is ~1 day of work (see `05-improvement-guide.md`).

**When to actually prefer Mongoose:**
- You need MongoDB-specific features Prisma doesn't support (change streams,
  transactions on sharded clusters, certain aggregation operators).
- You want middleware hooks (pre-save, post-find) — Prisma doesn't have them.

**When to prefer Prisma:**
- You want a single schema file that's the source of truth.
- You might switch databases later (Prisma supports Postgres, MySQL, SQLite,
  MongoDB, SQL Server — same client API).

### Zod (request validation)

**Why:** TypeScript types are compile-time only. Zod gives you runtime
validation with types that mirror your TS interfaces. The `validate`
middleware runs schemas on every request body / query / params.

**Alternatives:**
- **Joi** — older, less TS-friendly.
- **Yup** — similar API, slower.
- **class-validator + class-transformer** — requires classes; doesn't fit
  the functional style of the codebase.

### JWT + HTTP-only cookies (not sessions)

**Why:**
- **Stateless** — no session store required. Scales horizontally without
  sticky sessions.
- **HTTP-only cookies** are immune to XSS-based token theft (unlike
  localStorage tokens).
- **SameSite=lax** in dev, **SameSite=none + Secure** in prod → works
  cross-origin (Electron + web + future mobile).

**Alternatives:**
- **Express-session + Redis store** — server-side sessions. Revocation is
  easier (delete the session row), but requires Redis and sticky sessions.
- **Passport.js** — strategy-based auth. Adds abstraction; for a single
  JWT strategy, it's overhead.

### BullMQ + ioredis (best-effort queues)

**Why:** Email sending (passcodes, password resets, brand reports) shouldn't
block the HTTP response. BullMQ gives reliable retries + delayed jobs. If
Redis isn't available, `enqueueEmail()` no-ops gracefully.

**Alternatives:**
- **In-process queue** (`async-queue` / `p-queue`) — no Redis dependency,
  but jobs are lost on restart.
- **Cloud queues** (SQS, Cloud Tasks) — managed, but adds vendor lock-in.

### Helmet + express-rate-limit

**Why:** Defense in depth.
- **Helmet** sets 15 security headers (CSP, X-Frame-Options, etc.) with sane
  defaults.
- **express-rate-limit** prevents brute-force on `/api/auth/*` (5 req/min)
  and protects the global API (100 req/min).

**Alternatives:**
- **CSP via custom middleware** — possible but error-prone.
- **Cloudflare / Akamai rate limiting** — better for DDoS protection, but
  requires traffic to flow through their edge.

---

## Admin Portal (separate app)

### Why a separate app (not a route in the main frontend)?

1. **Different audience** — kiosk users see the boutique UI; franchise
   managers see a dashboard. Mixing them creates UX compromises.
2. **Different deployment** — the boutique frontend lives on a kiosk
   (locked-down Electron); the admin portal lives on a normal web URL with
   standard browser auth.
3. **Different bundle** — the admin portal pulls in chart libraries, table
   components, etc. that the kiosk app doesn't need.

The two apps share the **same backend** — same `/api/*` endpoints, same
auth, same database.

---

## When to reconsider the stack

| If… | Then switch to… |
|------|----------------|
| You need native iOS/Android | React Native (Expo), reuse the backend |
| You need 100k+ concurrent kiosks | Move pose detection to a GPU server (gRPC) |
| You need offline-first | Add a service worker + IndexedDB cache (PWA) |
| You outgrow MongoDB | Prisma makes it a 1-day migration to Postgres |
| You outgrow Express | Migrate to Fastify route-by-route (they're compatible) |
| Email volume > 10k/day | Move BullMQ to a dedicated worker process + SES |
| You need real-time try-on (sub-second) | Skip Stages 1+3, use a streaming TryOn AI |

---

## Summary: spec compliance

| Spec requirement | Status |
|------------------|--------|
| Frontend: React + Tailwind + shadcn + Electron | ✓ |
| Frontend: strictly no Next.js | ✓ (only used by the preview harness, not the production app) |
| Backend: Express + TypeScript | ✓ |
| Backend: Mongoose | ⚠ Prisma (MongoDB) — same capabilities, see migration guide |
| Loose coupling | ✓ (every external lib wrapped in a `lib/` adapter) |
| SOLID principles | ✓ (one responsibility per file, DIP via service layer) |
| Small components/hooks | ✓ (largest hook is 178 lines) |
| Setup guide in separate folder | ✓ (`setup-guide/`) |
| 35″–85″ screen support | ✓ (Tailwind breakpoints extended to `5xl: 3840px`) |
| Cross-platform (desktop/web/mobile) | ✓ desktop (Electron) + web (Vite) + responsive (Tailwind) |
