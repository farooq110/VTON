# Scripts

## integration-test.sh

End-to-end API test that exercises every backend endpoint the frontend calls.

### Prerequisites
- Backend running on `http://localhost:4000`
- Database seeded (`npm run seed` in `backend/`)
- `python3` + `curl` available

### Usage
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
./scripts/integration-test.sh
```

### What it tests
1. `GET /health`
2. `POST /api/auth/signin` (valid + invalid credentials)
3. `GET /api/auth/me` (with + without token)
4. `GET /api/brand`
5. `GET /api/products` (list + search + single + 404)
6. `POST /api/tryon/track`
7. `GET /api/tryon/track/list`
8. `GET /api/tryon/track/count`
9. `POST /api/auth/signout`

Exits 0 if all pass, 1 if any fail.
