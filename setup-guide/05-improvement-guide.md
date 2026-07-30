# 05 — Improvement Guide

How to extend, swap, and scale each part of the app without rewriting the world.

---

## Adding a new pose-detection model

The settings UI already supports 4 models (`DETECTION_MODELS` in
`frontend/src/lib/constants.ts`). To add a 5th:

1. Add the model id to the `DetectionModelId` type in `frontend/src/types/index.ts`:
   ```typescript
   export type DetectionModelId =
     | "yolov8n-pose"
     | "yolov8s-pose"
     // ...
     | "your-new-model"; // ← add
   ```

2. Map it to a Hugging Face repo in `frontend/src/hooks/usePoseDetection.ts`:
   ```typescript
   const MODEL_REPO: Record<DetectionModelId, string> = {
     // ...
     "your-new-model": "Xenova/your-new-model",
   };
   ```

3. Add a card in `DETECTION_MODELS` (constants.ts):
   ```typescript
   {
     id: "your-new-model",
     name: "Your New Model",
     description: "Faster than YOLOv8n, similar accuracy.",
     sizeMb: 4,
     speedMs: 35,
     accuracy: "Fast",
     recommended: false,
   }
   ```

The Settings page automatically renders a new card. No other code changes.

---

## Swapping the TryOn AI provider

The orchestrator posts to `settings.tryOnApiEndpoint` (configurable in the
Settings UI). To swap FASHN.ai for a different provider:

1. Update `settings.tryOnApiEndpoint` and `settings.tryOnApiKey` in the Settings UI.
2. If the new provider's request/response shape differs, edit ONE function:
   `callTryOnApi()` in `frontend/src/hooks/useTryOnOrchestrator.ts` (line ~160).

Everything else (camera, compression, pose, brand tracking, result display)
stays untouched.

---

## Swapping Prisma for Mongoose

The spec called for Mongoose; the repo uses Prisma. The service layer is the
**only** code that touches Prisma — routes and schemas are ORM-agnostic. To
migrate:

1. Install mongoose:
   ```bash
   cd backend && npm install mongoose
   ```

2. Create Mongoose models in `backend/src/models/` (one file per Prisma model).
   Example for `Brand`:
   ```typescript
   // src/models/brand.model.ts
   import { Schema, model } from 'mongoose';

   const brandSchema = new Schema({
     name: { type: String, required: true },
     tagline: { type: String, default: 'Try then Buy' },
     logoUrl: String,
     coverBannerUrl: String,
     customName: String,
     customLogoUrl: String,
     customCoverBannerUrl: String,
     primaryColor: { type: String, default: '#1c1917' },
     accentColor: { type: String, default: '#d4a017' },
     isActive: { type: Boolean, default: true },
   }, { timestamps: true });

   export const Brand = model('Brand', brandSchema);
   ```

3. Rewrite each `src/services/*.service.ts` file to use Mongoose instead of
   Prisma. The function signatures + return shapes stay identical, so routes
   and schemas don't change. ~10 files, ~400 lines total.

4. Update `src/lib/prisma.ts` → `src/lib/db.ts` to export the Mongoose
   connection.

5. Delete `prisma/schema.prisma` and the `@prisma/client` dependency.

**Estimated effort:** 1 day for an experienced Mongoose dev. Routes, schemas,
middleware, and frontend stay 100% untouched.

---

## Adding a new API endpoint

Pattern (consistent across the codebase):

1. **Schema** — `backend/src/schemas/<thing>.schema.ts`:
   ```typescript
   import { z } from 'zod';
   export const createThingSchema = z.object({
     name: z.string().min(1),
     // ...
   });
   export type CreateThingInput = z.infer<typeof createThingSchema>;
   ```

2. **Service** — `backend/src/services/<thing>.service.ts`:
   ```typescript
   import { prisma } from '../lib/prisma';
   export async function createThing(input: CreateThingInput) {
     return prisma.thing.create({ data: input });
   }
   ```

3. **Route** — `backend/src/routes/<thing>.routes.ts`:
   ```typescript
   router.post('/', requireAuth, validate({ body: createThingSchema }),
     asyncHandler(async (req, res) => {
       const result = await thingService.createThing(req.body);
       return sendOk(res, result, 201);
     }));
   ```

4. **Mount** — `backend/src/app.ts`:
   ```typescript
   app.use('/api/thing', thingRoutes);
   ```

That's it. The error middleware catches everything; the response helper
formats the envelope.

---

## Adding a new frontend page

1. Create `frontend/src/pages/YourPage.tsx`:
   ```tsx
   export function YourPage() {
     return (
       <div className="min-h-screen flex flex-col bg-background">
         <GlobalHeader title="Your page" backTo="/home" />
         <main className="flex-1 p-6">...</main>
       </div>
     );
   }
   ```

2. Add a route in `frontend/src/App.tsx` (gated by `isAuthed`):
   ```tsx
   <Route path="/your-page" element={isAuthed ? <YourPage /> : <Navigate to="/signin" replace />} />
   ```

3. (Optional) Add a menu entry in `HomePage.tsx`'s slide-down panel.

---

## Wiring real email for passcodes

Currently, passcodes are emailed via BullMQ's `enqueueEmail()` which no-ops
if Redis/SMTP isn't configured (and in dev, the passcode is also shown in
the UI for convenience). To wire a real provider:

1. Edit `backend/src/lib/queue.ts` → `enqueueEmail()`:
   ```typescript
   // Currently:
   export async function enqueueEmail() { /* no-op if no Redis */ }

   // Replace with:
   import nodemailer from 'nodemailer';
   const transporter = nodemailer.createTransport({ /* SMTP config */ });
   export async function enqueueEmail({ to, subject, template, data }) {
     const html = renderTemplate(template, data);
     await transporter.sendMail({ to, subject, html });
   }
   ```

2. Add SMTP env vars to `backend/src/config/env.ts`:
   ```typescript
   SMTP_HOST: z.string(),
   SMTP_PORT: z.coerce.number(),
   SMTP_USER: z.string(),
   SMTP_PASS: z.string(),
   ```

3. In production, **also remove the `devPasscode` field** from the
   `PasscodeChallenge` return shape in `passcode.service.ts`.

---

## Production hardening checklist

Before going live:

- [ ] Generate fresh `JWT_SECRET` and `ENCRYPTION_KEY` (never reuse dev secrets)
- [ ] Set `NODE_ENV=production` (hides dev passcodes, leaks no stack traces)
- [ ] Configure real SMTP (see above)
- [ ] Set `CORS_ORIGIN` to your exact production origins (no wildcards)
- [ ] Enable HTTPS termination (Caddy / Nginx / Cloudflare)
- [ ] Set `secure: true` on cookies (already auto-enabled when `NODE_ENV=production`)
- [ ] Add a real FASHN.ai API key + credits
- [ ] Run `npx prisma db push` against production MongoDB
- [ ] Replace demo admin credentials (`admin@admin-portal.local`) with real ones
- [ ] Set up log shipping (pino → Datadog / Loki / CloudWatch)
- [ ] Set up uptime monitoring on `/health`
- [ ] Configure BullMQ workers (currently inline) if you expect email volume

---

## Performance tuning

| Concern | Knob | Where |
|---------|------|-------|
| Pose model load time | Switch to `yolov8n-pose` (smallest) or pre-download weights | Settings UI → Detection model |
| Image compression speed | Increase `qualityStep` from 0.05 → 0.10 | Settings UI → Image optimisation |
| Trending rail page size | `PAGE_SIZE` constant | `frontend/src/components/home/TrendingProducts.tsx` line 27 |
| DB connection pool | `connection_limit` in `DATABASE_URL` | `backend/.env` |
| Rate limits | `RATE_LIMIT_MAX` / `authMax` | `backend/.env` + `config/index.ts` |

---

## Adding PWA / mobile installability

The app already has a PWA manifest at `frontend/public/manifest.json`. To
make it fully installable (Add to Home Screen):

1. Add `vite-plugin-pwa`:
   ```bash
   cd frontend && npm install -D vite-plugin-pwa
   ```

2. Update `vite.config.ts`:
   ```typescript
   import { VitePWA } from 'vite-plugin-pwa';
   export default defineConfig({
     plugins: [react(), VitePWA({ registerType: 'autoUpdate' })],
   });
   ```

3. Add icons (192px + 512px) — already present in `frontend/public/`.

---

## Electron desktop distribution

Already configured in `frontend/package.json`:

```bash
cd frontend
npm run build:electron
```

Outputs to `frontend/release/`:
- **macOS:** `.dmg` + `.zip`
- **Windows:** `.exe` (NSIS installer)
- **Linux:** `.AppImage` + `.deb`

For code signing:
- macOS: set `CSC_LINK` + `CSC_KEY_PASSWORD` env vars (Apple Developer ID)
- Windows: set `CSC_LINK` + `CSC_KEY_PASSWORD` (EV cert / Azure Trusted Signing)
- Auto-update: wire `electron-updater` into `electron/main.ts`

---

## Mobile (React Native) — future direction

The current app is web + desktop. For native mobile (iOS + Android), the
recommended path is **React Native (Expo)** reusing the backend as-is:

1. `npx create-expo-app atelier-nova-mobile`
2. Reuse the backend's TypeScript types via a shared package
3. Reuse `usePoseDetection` / `useImageCompression` logic — they're framework-agnostic
4. Replace `useCamera` with `expo-camera`
5. Replace `react-router-dom` with `expo-router`

The 2-step sign-in, brand, product, and try-on flows translate 1:1. The
TanStack Query + Zustand stack works identically in React Native.

---

## When to add Redis / BullMQ workers

Currently, BullMQ is in-process — `enqueueEmail()` runs synchronously in the
same Node process. This is fine for low volume. Switch to a dedicated worker
process when:

- You send > 100 emails/hour
- You add background jobs (image processing, AI retraining, report generation)
- You need retry logic with exponential backoff

Setup:
1. Run `redis-server` locally (or use Upstash for managed)
2. Extract the queue processor into `backend/src/workers/email.worker.ts`
3. Run it as a separate process: `tsx src/workers/email.worker.ts`
4. Use `pm2` or `systemd` to keep it alive
