# 03 — API Reference

All routes are mounted under `/api`. Every response follows the envelope:

```typescript
// Success
{ success: true,  data: T, message?: string }

// Error
{ success: false, error: { code, message }, message?: string }
```

Auth: send the JWT as `Authorization: Bearer <token>` OR as a cookie named
`admin_token` (set automatically by the backend on `/signin` and
`/passcode/verify`).

---

## Auth (`/api/auth`)

### `POST /api/auth/signin`
Legacy single-step sign-in (skips passcode). Used by the "Quick demo login"
button on the sign-in page.

**Body:**
```json
{ "email": "admin@atelier.nova", "password": "admin123" }
// OR (backend auto-detects)
{ "identifier": "admin@atelier.nova", "password": "admin123" }
```

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "user": { "id": "...", "email": "...", "name": "...", "role": "..." }
  },
  "message": "Signed in"
}
```

Also sets the `admin_token` HTTP-only cookie.

---

### `POST /api/auth/passcode/send`  ★ NEW (2-step sign-in — Step 1)
Validates credentials, generates a 6-digit passcode, emails it to the user.

**Body:**
```json
{ "email": "admin@atelier.nova", "password": "admin123" }
```

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "challengeId": "cm3xyz...",      // admin id — pass to /verify
    "email": "admin@atelier.nova",
    "expiresInMs": 600000,           // 10 minutes
    "devPasscode": "123456"          // ONLY in dev (omitted in production)
  },
  "message": "Passcode sent to admin@atelier.nova (dev: 123456)"
}
```

**Errors:**
- `401 UNAUTHORIZED` — invalid email or password
- `429` — rate limit (5 auth requests / minute)

---

### `POST /api/auth/passcode/verify`  ★ NEW (2-step sign-in — Step 2)
Verifies the 6-digit passcode and issues a JWT.

**Body:**
```json
{ "identifier": "cm3xyz...", "passcode": "123456" }
// identifier can be the challengeId from /send OR the email address
```

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "user": { "id": "...", "email": "...", "name": "...", "role": "..." }
  },
  "message": "Signed in"
}
```

**Errors:**
- `401 UNAUTHORIZED` — "Incorrect passcode. N attempts remaining."
- `401 UNAUTHORIZED` — "Passcode expired. Request a new code."
- `401 UNAUTHORIZED` — "Too many incorrect attempts (5). Request a new code."

Locks out after 5 failed attempts (requires a fresh `/passcode/send` call).

---

### `POST /api/auth/signout`
Clears the auth cookie. Stateless JWT — token blacklist (if needed) lives in
Redis.

**Response:** `200` `{ success: true, data: null, message: "Signed out" }`

---

### `GET /api/auth/me`
Returns the currently-authenticated user.

**Response:** `200`
```json
{
  "success": true,
  "data": { "id": "...", "email": "...", "name": "...", "role": "super_admin" }
}
```

---

### `POST /api/auth/forgot-password`
Triggers a password reset email (best-effort — silent if email doesn't exist).

**Body:** `{ "email": "admin@atelier.nova" }`

**Response:** `200` `{ success: true, data: null, message: "If that email exists, a reset link has been sent" }`

In dev, the reset token is also surfaced in the message for convenience.

---

### `POST /api/auth/reset-password`
Resets the password using a token from `/forgot-password`.

**Body:** `{ "token": "...", "password": "newpassword123" }` (min 8 chars)

**Response:** `200` `{ success: true, data: null, message: "Password has been reset" }`

---

## Brand (`/api/brand`)  ★ NEW

### `GET /api/brand`
Returns the active brand's storefront identity (cover banner, logo, name,
tagline, theme colors). Auto-seeds a default brand if none exists.

**Auth:** Optional (works without a token — the boutique home page is public-ish).

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "brand": {
      "id": "cm3xyz...",
      "name": "Atelier Nova",
      "tagline": "Try then Buy",
      "logoUrl": null,
      "coverBannerUrl": null,
      "customName": null,
      "customLogoUrl": null,
      "customCoverBannerUrl": null,
      "primaryColor": "#1c1917",
      "accentColor": "#d4a017",
      "isActive": true
    }
  }
}
```

---

### `GET /api/brand/list`
Returns all brands (admin portal only).

**Auth:** Required.

**Response:** `200` `{ success: true, data: { brands: [...] } }`

---

### `PATCH /api/brand/:id`
Updates brand identity fields. Used by the admin portal's BrandSection.

**Auth:** Required.

**Body (any subset of):**
```json
{
  "name": "Atelier Nova",
  "tagline": "Try then Buy",
  "logoUrl": "https://...",
  "coverBannerUrl": "https://...",
  "customName": "Atelier Nova NYC",
  "customLogoUrl": "https://...",
  "customCoverBannerUrl": "https://...",
  "primaryColor": "#1c1917",
  "accentColor": "#d4a017"
}
```

**Response:** `200` `{ success: true, data: { brand: {...} }, message: "Brand updated" }`

---

## Products (`/api/products`)  ★ NEW

### `GET /api/products`
Lists products with optional filters + paging.

**Auth:** Required.

**Query params:**
| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `page` | int | 1 | 1-indexed |
| `pageSize` | int | 100 | max 200 |
| `search` | string | — | case-insensitive contains on name, sku, code, description |
| `category` | string | — | exact match |
| `isNew` | bool | — | `true` returns only `isNew: true` rows |
| `inStock` | bool | — | `true` returns only `inStock: true` rows |
| `sort` | enum | `trending` | `trending` \| `newest` \| `price-asc` \| `price-desc` |

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "...",
        "sku": "AN-SU-ANARKALI-001",
        "code": "NOVA-001",
        "name": "Anarkali Suit",
        "description": "Floor-length Anarkali...",
        "price": 459,
        "currency": "USD",
        "category": "Suits",
        "imageUrl": null,
        "garmentOverlayUrl": null,
        "sizes": ["XS","S","M","L","XL"],
        "colors": [{"name":"Emerald","hex":"#0f766e"}],
        "isNew": true,
        "inStock": true,
        "trendingScore": 92
      }
    ],
    "total": 8,
    "page": 1,
    "pageSize": 100
  }
}
```

---

### `GET /api/products/:id`
Returns a single product by id.

**Auth:** Required.

**Response:** `200` `{ success: true, data: { product: {...} } }`
**Errors:** `404 NOT_FOUND` if id doesn't exist.

---

## TryOn Tracking (`/api/tryon`)  ★ NEW

### `POST /api/tryon/track`
Logs a try-on request (called fire-and-forget by the frontend's orchestrator
after every TryOn AI call). Never blocks the UI — tracking failures are
swallowed server-side.

**Auth:** Required.

**Body:**
```json
{
  "brandId": "cm3xyz...",
  "franchiseId": "cm3abc...",
  "userId": "cm3def...",
  "productSku": "AN-SU-ANARKALI-001",
  "timestamp": 1701234567890,    // optional, defaults to now
  "status": "success",           // success | failed | skipped
  "durationMs": 4200             // optional
}
```

**Response:** `201` `{ success: true, data: { id: "...", ok: true }, message: "Tracked" }`

---

### `GET /api/tryon/track/list`
Paged list of try-on log rows. Used by the admin portal's per-brand usage
dashboard.

**Auth:** Required.

**Query:** `brandId`, `franchiseId`, `userId`, `page`, `pageSize` (all optional).

**Response:** `200` (paginated)
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "...",
        "brandId": "...",
        "franchiseId": "...",
        "userId": "...",
        "productSku": "...",
        "status": "success",
        "durationMs": 4200,
        "timestamp": "2026-07-30T..."
      }
    ],
    "total": 152,
    "page": 1,
    "pageSize": 50,
    "totalPages": 4,
    "hasMore": true
  }
}
```

---

### `GET /api/tryon/track/count?brandId=...`
Returns the total request count for a brand. Never throws.

**Auth:** Required.

**Response:** `200` `{ success: true, data: { brandId: "...", count: 152 } }`

---

## VTON — FASHN.ai Submission (`/api/vton`)

These endpoints submit real try-on jobs to FASHN.ai. **Existing endpoints —
not modified in this iteration.**

### `POST /api/vton/tryon`
Submits a try-on request to FASHN.ai.

**Body:** `{ "franchiseId": "...", "inputs": [{ "model_image": "...", "garment_image": "..." }] }`

**Response:** `201` `{ success: true, data: { id, fashnId, status, ... } }`

### `GET /api/vton/list`
Paged list of VTON requests.

### `GET /api/vton/status/:id`
Polls the status of a VTON request (FASHN.ai is async).

### `GET /api/vton/credits?customerId=...`
Returns credit usage summary for a customer.

---

## Admin Portal APIs (existing — unchanged)

| Route | Purpose |
|-------|---------|
| `GET/POST/PATCH/DELETE /api/customers/*` | B2B customer CRUD |
| `GET/POST/PATCH/DELETE /api/franchises/*` | Franchise CRUD |
| `GET /api/usage/*` | Per-day credit usage analytics |
| `GET/POST/PATCH /api/pricing/*` | Progressive pricing tiers |
| `GET/POST/PATCH /api/invoices/*` | Monthly billing |
| `GET/POST/PATCH /api/notifications/*` | In-app notifications |
| `GET /api/activity/*` | Server-side activity log |
| `GET /health` | Health check (DB + Redis ping) |

---

## Rate limits

| Bucket | Limit | Window |
|--------|-------|--------|
| Global (all `/api/*`) | 100 req | 1 min |
| Auth (`/api/auth/signin`, `/passcode/*`, `/forgot-password`) | 5 req | 1 min |

Exceeding returns `429 { error: { code: "RATE_LIMIT", message: "Too many requests" } }`.
