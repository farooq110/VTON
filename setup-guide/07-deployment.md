# 07 — Deployment

Production deployment for the three target surfaces: **web**, **desktop**,
**mobile (responsive PWA)**. The same React app serves all three.

---

## 1. Backend deployment

### Option A: Single VM (simplest)

Best for low-to-medium traffic (< 100 RPS).

**Stack:** Node 20+ running behind Caddy (auto-HTTPS) on a $10/mo VPS
(DigitalOcean / Hetzner / Linode).

```bash
# On the server
git clone https://github.com/farooq110/VTON.git
cd VTON/backend
cp .env.example .env  # edit production values
npm ci --omit=dev
npx prisma generate
npx prisma db push    # apply schema to prod MongoDB
npm run build
npm run seed          # one-time: create admin + brand + products

# Run with pm2 (auto-restart + logs)
npm install -g pm2
pm2 start dist/index.js --name vton-backend
pm2 save
pm2 startup           # auto-start on boot
```

**Caddyfile** (auto-HTTPS via Let's Encrypt):
```
api.yourboutique.com {
  reverse_proxy localhost:4000
}
```

### Option B: Docker + Compose

```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    ports: ["4000:4000"]
    env_file: ./backend/.env
    depends_on: [mongo, redis]

  mongo:
    image: mongo:7
    volumes: ["mongo-data:/data/db"]

  redis:
    image: redis:7-alpine

volumes:
  mongo-data:
```

```dockerfile
# backend/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npx prisma generate && npx tsc
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

```bash
docker compose up -d
```

### Option C: Managed (Render / Railway / Fly.io)

Push the repo, set env vars in the dashboard, done. Render + Railway support
Prisma migrations out of the box. MongoDB Atlas for the DB (free M0 tier
covers up to 512 MB).

---

## 2. Frontend (web) deployment

The frontend is a static SPA — Vite outputs `dist/`. Host it anywhere.

### Build

```bash
cd frontend
VITE_API_BASE_URL=https://api.yourboutique.com/api npm run build
# Output: frontend/dist/
```

### Deploy

**Option A — Cloudflare Pages / Netlify / Vercel (free tier):**
- Connect the GitHub repo
- Build command: `cd frontend && npm install && npm run build`
- Output directory: `frontend/dist`
- Env var: `VITE_API_BASE_URL=https://api.yourboutique.com/api`

**Option B — Same origin as the backend (no CORS):**
- Serve `dist/` from Express: `app.use(express.static('public'))` + a
  catch-all that returns `index.html` for non-API routes
- Single domain, no CORS preflight

**Option C — CDN (Cloudflare / CloudFront):**
- Upload `dist/` to a bucket, front it with a CDN
- Set `Cache-Control: public, max-age=31536000, immutable` on hashed assets
- Set `Cache-Control: no-cache` on `index.html`

---

## 3. Desktop (Electron) distribution

### Build binaries for all platforms

```bash
cd frontend
npm run build:electron
```

Output: `frontend/release/`
- macOS: `Atelier Nova TryOn-1.0.0.dmg` + `.zip`
- Windows: `Atelier Nova TryOn Setup 1.0.0.exe`
- Linux: `Atelier Nova TryOn-1.0.0.AppImage` + `.deb`

### Code signing (required for distribution outside dev mode)

**macOS:**
```bash
export CSC_LINK="path/to/developer-id.p12"
export CSC_KEY_PASSWORD="your-password"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
npm run build:electron
# Electron-builder will sign + notarize automatically
```

**Windows:**
```bash
export CSC_LINK="path/to/cert.pfx"
export CSC_KEY_PASSWORD="your-password"
npm run build:electron
```

### Auto-update (recommended for kiosks)

Add `electron-updater` to `electron/main.ts`:

```typescript
import { autoUpdater } from 'electron-updater';
app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify();
});
autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});
```

Host the update feed on GitHub Releases (free) or S3.

### Kiosk mode (for in-store displays)

Lock the Electron window to fullscreen + disable devtools:

```typescript
// electron/main.ts
const win = new BrowserWindow({
  fullscreen: true,
  kiosk: true,
  webPreferences: { devTools: false },
});
```

Useful for the 35″–85″ in-store displays mentioned in the spec.

---

## 4. Mobile (PWA)

The frontend already has a PWA manifest. To make it installable on iOS /
Android home screens:

### Add vite-plugin-pwa

```bash
cd frontend
npm install -D vite-plugin-pwa
```

```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Atelier Nova TryOn',
        short_name: 'Nova',
        theme_color: '#1c1917',
        background_color: '#1c1917',
        display: 'standalone',
        orientation: 'portrait',
      },
    }),
  ],
});
```

### iOS camera permissions (PWA)

iOS Safari requires HTTPS for camera access. Add to `index.html`:
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

### Native mobile (future)

For true native iOS/Android (camera performance, push notifications, App
Store distribution), see `05-improvement-guide.md → Mobile (React Native)`.

---

## 5. Environment-specific configuration

### Frontend

The frontend reads ONLY ONE env var: `VITE_API_BASE_URL`. Set it per
environment:

| Environment | Value |
|-------------|-------|
| Local dev | `http://localhost:4000/api` (default) |
| Staging | `https://api-staging.yourboutique.com/api` |
| Production | `https://api.yourboutique.com/api` |

### Backend

See `backend/.env.example` for the full list. Critical production values:

| Var | Production value |
|-----|------------------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | MongoDB Atlas connection string |
| `JWT_SECRET` | 64-char random hex (`openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | 64-char random hex (different from JWT_SECRET) |
| `REDIS_URL` | Managed Redis (Upstash / Redis Cloud) |
| `CORS_ORIGIN` | Comma-separated list of your exact frontend origins |
| `FASHN_API_BASE_URL` | `https://api.fashn.ai` |

---

## 6. Post-deploy verification

After deploying, hit these endpoints to confirm everything works:

```bash
# Health check (no auth)
curl https://api.yourboutique.com/health
# → { "status": "ok", "db": true, "redis": true }

# Brand (optional auth)
curl https://api.yourboutique.com/api/brand
# → { "success": true, "data": { "brand": { "name": "Atelier Nova", ... } } }

# Products (requires auth)
curl -H "Authorization: Bearer $TOKEN" https://api.yourboutique.com/api/products
# → { "success": true, "data": { "products": [...] } }

# Sign-in flow
curl -X POST https://api.yourboutique.com/api/auth/passcode/send \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourboutique.com","password":"..."}'
# → { "success": true, "data": { "challengeId":"...","email":"..." } }
```

Then open the frontend URL and run through the full try-on flow.

---

## 7. Monitoring

| Signal | Tool | Alert threshold |
|--------|------|-----------------|
| Uptime | UptimeRobot / BetterUptime | 1 min downtime |
| Error rate | Sentry (frontend + backend) | > 1% of requests |
| API latency | Datadog / Grafana Cloud | p95 > 500 ms |
| DB connections | MongoDB Atlas dashboard | > 80% of pool |
| Disk usage (logs) | Logrotate + alert | > 80% full |
| FASHN.ai credits | FASHN dashboard | < 100 remaining |
| TryOn success rate | Custom metric on `/tryon/track` | < 90% |

---

## 8. Backup strategy

- **MongoDB Atlas** — automated daily snapshots (free tier: 24h retention;
  paid: 7+ days). Enable point-in-time recovery for production.
- **`.env` files** — store in a password manager (1Password / Bitwarden),
  never in git.
- **Code** — GitHub (already). Enable branch protection + require PR reviews
  for `main`.
- **Electron build artifacts** — replicate to S3 + GitHub Releases for
  auto-update redundancy.

---

## 9. Scaling path

When you outgrow a single VM:

1. **Backend:** Scale horizontally behind a load balancer (sticky sessions
   NOT needed — JWT is stateless). 2-4 instances handles ~1000 RPS.
2. **MongoDB:** Upgrade Atlas tier (M10 → M20 → M50). Add read replicas.
3. **Redis:** Upgrade to a managed cluster (ElastiCache / Upstash Pro).
4. **BullMQ workers:** Extract to a separate process, scale independently.
5. **Static assets:** Move to a CDN (already recommended above).
6. **Image uploads (if you add them):** S3 + CloudFront, presigned URLs.

The architecture is horizontally scalable by design — no code changes needed
for steps 1-3.
