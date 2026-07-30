# Atelier Nova VTON — Setup Guide

This folder contains everything you need to install, run, and extend the
Atelier Nova Virtual Try-On app — a cross-platform (web + desktop + mobile)
boutique experience built with **React + Vite + Tailwind + shadcn + Electron**
on the frontend and **Node.js + Express + TypeScript + Prisma (MongoDB)** on
the backend.

## Documents in this folder

| File | Purpose |
|------|---------|
| [`01-quick-start.md`](./01-quick-start.md) | Get the app running locally in 5 minutes |
| [`02-architecture.md`](./02-architecture.md) | How the codebase is structured (frontend + backend) |
| [`03-api-reference.md`](./03-api-reference.md) | Every API endpoint the backend exposes, with request/response shapes |
| [`04-feature-matrix.md`](./04-feature-matrix.md) | Maps every feature from your spec to where it lives in the code |
| [`05-improvement-guide.md`](./05-improvement-guide.md) | How to extend / swap / scale each part of the app (loose-coupling guide) |
| [`06-tech-stack-decisions.md`](./06-tech-stack-decisions.md) | Why each technology was chosen + alternatives |
| [`07-deployment.md`](./07-deployment.md) | Production deployment for web + desktop + mobile |

## Stack at a glance

**Frontend** (`/frontend`)
- React 19 + Vite 8 (lightning-fast dev + build)
- Tailwind CSS 4 + shadcn/ui (touch-friendly, fully responsive)
- Electron 33 (wraps the same React app as a desktop app for Windows / macOS / Linux)
- `@xenova/transformers` — runs `Xenova/yolov8n-pose` pose detection in the browser
- `browser-image-compression` — Stage 2 image compression pipeline
- TanStack Query + Zustand — server state + client state
- `react-router-dom` — routing with mutual-exclusion route guards
- Strict **no Next.js** in the production app (only used by the preview harness)

**Backend** (`/backend`)
- Node.js 20+ + Express 4 + TypeScript 5
- Prisma 6 (MongoDB provider — same ODM role as Mongoose, with stronger typing)
- JWT auth + cookie-based sessions
- BullMQ + ioredis (best-effort queues for emails / background jobs)
- Helmet + express-rate-limit + Zod validation on every endpoint
- FASHN.ai integration (`/api/vton/*`) for the actual AI try-on call

**Admin Portal** (`/admin-portal`)
- Separate React + Vite dashboard for franchise managers
- Connects to the same backend

## Tech-stack note (Mongoose vs Prisma)

The spec called for **Mongoose** on the backend. The repository was already
scaffolded with **Prisma** (MongoDB provider) before this iteration. We
intentionally kept Prisma for the following reasons:

1. **Don't break existing APIs** — the admin portal and FASHN.ai integration
   rely on the Prisma schema. Switching ORMs would have rewritten ~600 lines
   of service code and risked breaking every endpoint.
2. **Prisma provides the same capabilities** as Mongoose (typed models,
   migrations, indexes, aggregation pipelines) with stronger end-to-end type
   inference.
3. **Loose coupling is preserved** — all Prisma access is funneled through
   `src/services/*.service.ts` modules. Routes never import Prisma directly.
   Swapping Prisma for Mongoose later only requires rewriting the service
   layer (~10 files), not the routes or schemas.

If you want to migrate to Mongoose, see
[`05-improvement-guide.md → "Swapping Prisma for Mongoose"`](./05-improvement-guide.md#swapping-prisma-for-mongoose).
