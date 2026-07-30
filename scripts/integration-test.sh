#!/usr/bin/env bash
#
# integration-test.sh — exercises every backend endpoint the frontend calls,
# in the order the frontend calls them. Verifies the full sign-in → home →
# products → try-on flow works end-to-end against a running backend.
#
# Usage:
#   DATABASE_URL="file:./dev.db" node dist/index.js &  # start backend
#   ./scripts/integration-test.sh                       # run this script
#
# Exits 0 if all tests pass, 1 if any fail.

set -uo pipefail

BASE_URL="http://localhost:4000"
PASS=0
FAIL=0
TOKEN=""
BRAND_ID=""
PRODUCT_ID=""
PRODUCT_SKU=""

red()    { printf "\033[31m%s\033[0m\n" "$1"; }
green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
section(){ printf "\n\033[1;36m=== %s ===\033[0m\n" "$1"; }

check() {
  local label="$1"
  local condition="$2"
  if [ "$condition" = "true" ]; then
    green "  PASS: $label"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $label"
    FAIL=$((FAIL + 1))
  fi
}

# ---------------------------------------------------------------------------
section "0. Health"
HEALTH=$(curl -s "$BASE_URL/health")
echo "  $HEALTH" | head -c 300
echo ""
check "GET /health responds" "$(echo "$HEALTH" | grep -q '"status"' && echo true || echo false)"

# ---------------------------------------------------------------------------
section "1. Auth - POST /api/auth/signin"
SIGNIN=$(curl -s -X POST "$BASE_URL/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin@atelier.nova","password":"admin123"}')
echo "  $SIGNIN" | head -c 500
echo ""
check "signin returns success:true"  "$(echo "$SIGNIN" | grep -q '"success":true' && echo true || echo false)"
check "signin returns a token"       "$(echo "$SIGNIN" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin)["data"]["token"] else "false")' 2>/dev/null)"
check "signin returns user.email"    "$(echo "$SIGNIN" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin)["data"]["user"]["email"]=="admin@atelier.nova" else "false")' 2>/dev/null)"
check "signin returns user.brandId"  "$(echo "$SIGNIN" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin)["data"]["user"]["brandId"] else "false")' 2>/dev/null)"
check "signin returns user.franchiseId" "$(echo "$SIGNIN" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin)["data"]["user"]["franchiseId"] else "false")' 2>/dev/null)"

TOKEN=$(echo "$SIGNIN" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])' 2>/dev/null)
AUTH_HDR="Authorization: Bearer $TOKEN"

# ---------------------------------------------------------------------------
section "2. Auth - GET /api/auth/me (with token)"
ME=$(curl -s -H "$AUTH_HDR" "$BASE_URL/api/auth/me")
echo "  $ME" | head -c 300
echo ""
check "/me returns the user" "$(echo "$ME" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin)["data"]["email"]=="admin@atelier.nova" else "false")' 2>/dev/null)"

# ---------------------------------------------------------------------------
section "3. Auth - POST /api/auth/signin (wrong password should 401)"
BAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin@atelier.nova","password":"wrong"}')
check "wrong password returns 401" "$([ "$BAD" = "401" ] && echo true || echo false)"

# ---------------------------------------------------------------------------
section "4. Brand - GET /api/brand"
BRAND=$(curl -s -H "$AUTH_HDR" "$BASE_URL/api/brand")
echo "  $BRAND" | head -c 400
echo ""
check "brand returns success"   "$(echo "$BRAND" | grep -q '"success":true' && echo true || echo false)"
check "brand has name"          "$(echo "$BRAND" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin)["data"]["brand"]["name"] else "false")' 2>/dev/null)"
check "brand has tagline"       "$(echo "$BRAND" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin)["data"]["brand"]["tagline"] else "false")' 2>/dev/null)"
BRAND_ID=$(echo "$BRAND" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["brand"]["id"])' 2>/dev/null)

# ---------------------------------------------------------------------------
section "5. Products - GET /api/products"
PRODUCTS=$(curl -s -H "$AUTH_HDR" "$BASE_URL/api/products")
echo "  $PRODUCTS" | head -c 400
echo ""
check "products returns success" "$(echo "$PRODUCTS" | grep -q '"success":true' && echo true || echo false)"
PROD_COUNT=$(echo "$PRODUCTS" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]["products"]))' 2>/dev/null)
check "products array non-empty" "$([ "${PROD_COUNT:-0}" -gt 0 ] && echo true || echo false)"
echo "  Found $PROD_COUNT products"
PRODUCT_ID=$(echo "$PRODUCTS" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["products"][0]["id"])' 2>/dev/null)
PRODUCT_SKU=$(echo "$PRODUCTS" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["products"][0]["sku"])' 2>/dev/null)
echo "  First product: id=$PRODUCT_ID sku=$PRODUCT_SKU"

# ---------------------------------------------------------------------------
section "6. Products - GET /api/products?search=Anarkali"
SEARCH=$(curl -s -H "$AUTH_HDR" "$BASE_URL/api/products?search=Anarkali")
echo "  $SEARCH" | head -c 300
echo ""
SEARCH_COUNT=$(echo "$SEARCH" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]["products"]))' 2>/dev/null)
check "search returns matching products" "$([ "${SEARCH_COUNT:-0}" -ge 1 ] && echo true || echo false)"

# ---------------------------------------------------------------------------
section "7. Products - GET /api/products/:id"
ONEPROD=$(curl -s -H "$AUTH_HDR" "$BASE_URL/api/products/$PRODUCT_ID")
echo "  $ONEPROD" | head -c 400
echo ""
check "product detail returns success" "$(echo "$ONEPROD" | grep -q '"success":true' && echo true || echo false)"
check "product detail has matching sku" "$(echo "$ONEPROD" | python3 -c "import sys,json; print('true' if json.load(sys.stdin)['data']['product']['sku']=='$PRODUCT_SKU' else 'false')" 2>/dev/null)"

# ---------------------------------------------------------------------------
section "8. Products - GET /api/products/:id (invalid id -> 404)"
NOTFOUND=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HDR" "$BASE_URL/api/products/nonexistent-id")
check "invalid product id returns 404" "$([ "$NOTFOUND" = "404" ] && echo true || echo false)"

# ---------------------------------------------------------------------------
section "9. TryOn - POST /api/tryon/track"
if [ -n "$BRAND_ID" ] && [ -n "$PRODUCT_SKU" ]; then
  TRACK=$(curl -s -X POST "$BASE_URL/api/tryon/track" \
    -H "$AUTH_HDR" -H "Content-Type: application/json" \
    -d "{\"brandId\":\"$BRAND_ID\",\"franchiseId\":\"franchise_test\",\"userId\":\"test_user\",\"productSku\":\"$PRODUCT_SKU\",\"status\":\"success\",\"durationMs\":1234}")
  echo "  $TRACK" | head -c 300
  echo ""
  check "track returns success" "$(echo "$TRACK" | grep -q '"success":true' && echo true || echo false)"
else
  yellow "  (skipped - missing BRAND_ID or PRODUCT_SKU)"
fi

# ---------------------------------------------------------------------------
section "10. TryOn - GET /api/tryon/track/list"
TLIST=$(curl -s -H "$AUTH_HDR" "$BASE_URL/api/tryon/track/list?brandId=$BRAND_ID")
echo "  $TLIST" | head -c 400
echo ""
check "track list returns success" "$(echo "$TLIST" | grep -q '"success":true' && echo true || echo false)"
TLIST_COUNT=$(echo "$TLIST" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]["items"]))' 2>/dev/null)
check "track list has the row we just posted" "$([ "${TLIST_COUNT:-0}" -ge 1 ] && echo true || echo false)"

# ---------------------------------------------------------------------------
section "11. TryOn - GET /api/tryon/track/count?brandId=..."
COUNT=$(curl -s -H "$AUTH_HDR" "$BASE_URL/api/tryon/track/count?brandId=$BRAND_ID")
echo "  $COUNT" | head -c 200
echo ""
check "track count returns success" "$(echo "$COUNT" | grep -q '"success":true' && echo true || echo false)"
check "track count > 0" "$(echo "$COUNT" | python3 -c 'import sys,json; print("true" if json.load(sys.stdin)["data"]["count"]>0 else "false")' 2>/dev/null)"

# ---------------------------------------------------------------------------
section "12. Auth - POST /api/auth/signout"
SIGNOUT=$(curl -s -X POST "$BASE_URL/api/auth/signout" -H "$AUTH_HDR")
check "signout returns success" "$(echo "$SIGNOUT" | grep -q '"success":true' && echo true || echo false)"

# ---------------------------------------------------------------------------
section "13. Auth - GET /api/auth/me without token (should 401)"
NOTOK=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/auth/me")
check "no-token /me returns 401" "$([ "$NOTOK" = "401" ] && echo true || echo false)"

# ---------------------------------------------------------------------------
echo ""
section "SUMMARY"
green "  Passed: $PASS"
if [ "$FAIL" -gt 0 ]; then
  red "  Failed: $FAIL"
  exit 1
else
  green "  Failed: $FAIL"
  exit 0
fi
