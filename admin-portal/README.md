# Admin Portal

Vite + React + TypeScript admin UI for the VTON platform. Calls the Express
backend at `http://localhost:4000/api` (configurable via `VITE_API_URL`).

## Tech stack

- Vite 5+, React 18+, TypeScript 5+
- shadcn/ui (Radix UI + Tailwind) — `src/client/components/ui/`
- Tailwind CSS 3 + `tailwindcss-animate`
- react-router-dom v6 (hash-based routing)
- @tanstack/react-query v5
- react-hook-form + @hookform/resolvers + zod
- lucide-react icons, recharts charts, sonner toasts
- vite-plugin-pwa

## Project layout

```
admin-portal/
├── src/
│   ├── client/              # Browser code
│   │   ├── components/
│   │   │   ├── ui/          # shadcn/ui primitives
│   │   │   ├── layout/      # AppShell, Sidebar, Topbar
│   │   │   └── shared/      # DynamicForm, Pagination, ViewToggle, VoiceButton, CascadingAddress
│   │   ├── pages/           # One file per route
│   │   ├── hooks/           # useAuth, useAppSettings, useToast, useMobile, useTheme, useDebounced
│   │   ├── lib/             # api-client (fetch wrapper), utils (cn helper)
│   │   ├── App.tsx          # Router + providers
│   │   └── index.css        # Tailwind directives + global styles
│   ├── server/              # SSR entry (stub)
│   ├── shared/              # Code shared between client and server
│   │   ├── types.ts
│   │   └── constants.ts
│   ├── main.tsx             # Vite entry point
│   └── vite-env.d.ts
├── public/                  # manifest.json, icons
├── package.json
├── vite.config.ts           # Vite + PWA + dev proxy → :4000
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
├── tsconfig.node.json
├── components.json          # shadcn/ui config
├── eslint.config.js
├── .env.example
└── .gitignore
```

## Getting started

```bash
# 1. Install deps
npm install

# 2. Copy env
cp .env.example .env

# 3. Start the dev server (proxies /api → http://localhost:4000)
npm run dev
```

Open <http://localhost:5173> — the sign-in page should render.

## Environment variables

| Var | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:4000/api` | Backend API base URL |
| `VITE_DEMO_ENABLED` | `true` | Enable the `/demo` route |
| `VITE_APP_NAME` | `Admin Portal` | Sidebar/title display name |

## Architecture notes

- **Loose coupling** — every third-party lib is wrapped in `src/client/lib/` or
  `src/client/hooks/` so it can be swapped without touching pages. The API
  client (`api-client.ts`) wraps `fetch`; toasts wrap `sonner`; theme + settings
  are localStorage-backed.
- **Cookie-based auth** — every API call sends `credentials: "include"`. On 401
  the api-client redirects to `/signin`.
- **Forms** — react-hook-form + zod via the `DynamicForm` shared component.
- **Server state** — @tanstack/react-query for queries and mutations.
- **Routing** — `createHashRouter` (hash-based) so the SPA works without server
  rewrites.
- **PWA** — `vite-plugin-pwa` registers an auto-updating service worker; the
  manifest is in `public/manifest.json`.
- **Demo mode** — loosely coupled; controlled by `VITE_DEMO_ENABLED`. When
  disabled, `/demo` redirects to `/signin`.

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | `tsc` type-check + `vite build` |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |

## Pages

| Route | Page |
| --- | --- |
| `#/signin` | SignInPage |
| `#/` | DashboardPage |
| `#/customers` | CustomersPage |
| `#/franchises` | FranchisesPage |
| `#/usage` | UsagePage |
| `#/vton` | VtonPage |
| `#/pricing` | PricingPage |
| `#/notifications` | NotificationsPage |
| `#/activity` | ActivityPage |
| `#/settings` | SettingsPage |
| `#/profile` | ProfilePage |
| `#/demo` | DemoPage |
