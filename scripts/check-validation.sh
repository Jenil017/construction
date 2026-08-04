#!/usr/bin/env bash
#
# Live validation checks against a running API.
#
# Each rule is tested twice: the bad value must be rejected (400) AND the good
# value must still be accepted — a guard that blocks everything is as broken as
# no guard at all, and only the second half of each pair catches that.
#
# Covers the money-integrity guards (invoice over-payment, salary advance
# ceiling) as well as format rules, because those were real exploitable defects
# rather than cosmetic validation.
#
#   pnpm --filter @construction-erp/api dev          # in another terminal
#   CHECK_EMAIL=... CHECK_PASSWORD=... bash scripts/check-validation.sh
#
# Creates a throwaway site and deletes it (with everything under it) at the end.
set -uo pipefail
API=${API_URL:-http://127.0.0.1:8787}
EMAIL=${CHECK_EMAIL:?set CHECK_EMAIL}; PASSWORD=${CHECK_PASSWORD:?set CHECK_PASSWORD}

pass=0; fail=0
jq_get() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);console.log($1)}catch(e){console.log('')}})"; }

login() { curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | jq_get "j.data.accessToken"; }

TOKEN=$(login)
[ -n "$TOKEN" ] || { echo "LOGIN FAILED"; exit 1; }

# Unique code per run: site codes are unique per owner, so a fixed one collides
# with a previous run whose cleanup didn't complete.
RUN_TAG=$(date +%s)
SITE=$(curl -s -X POST "$API/sites" -H 'content-type: application/json' \
  -H "authorization: Bearer $TOKEN" \
  -d "{\"name\":\"Validation Check $RUN_TAG\",\"code\":\"VLD$RUN_TAG\"}" | jq_get "j.data.id")
[ -n "$SITE" ] || { echo "SITE CREATE FAILED (is the API running?)"; exit 1; }
TOKEN=$(login)   # refresh so the token carries the new site
H=(-H "content-type: application/json" -H "authorization: Bearer $TOKEN" -H "X-Site-Id: $SITE")

# check <name> <expected-code> <method> <path> <body>
check() {
  local name="$1" want="$2" method="$3" path="$4" body="${5:-}"
  local code
  if [ -n "$body" ]; then
    code=$(curl -s -o /tmp/vc_out -w '%{http_code}' -X "$method" "$API$path" "${H[@]}" -d "$body")
  else
    code=$(curl -s -o /tmp/vc_out -w '%{http_code}' -X "$method" "$API$path" "${H[@]}")
  fi
  if [ "$code" = "$want" ]; then
    echo "  PASS  $name ($code)"; pass=$((pass+1))
  else
    echo "  FAIL  $name — wanted $want got $code: $(head -c 160 /tmp/vc_out)"; fail=$((fail+1))
  fi
}

echo "=== Phone (10 digits, 6-9 start) ==="
check "reject 'hello world'"        400 POST /suppliers '{"name":"S1","phone":"hello world"}'
check "reject 5-digit"              400 POST /suppliers '{"name":"S2","phone":"12345"}'
check "reject leading 1"            400 POST /suppliers '{"name":"S3","phone":"1234567890"}'
check "accept plain 10-digit"       201 POST /suppliers '{"name":"S4","phone":"9825012345"}'
check "accept +91 with spaces"      201 POST /suppliers '{"name":"S5","phone":"+91 98250 12346"}'

echo "=== Email ==="
check "reject bad supplier email"   400 POST /suppliers '{"name":"S6","email":"not-an-email"}'
check "accept valid email"          201 POST /suppliers '{"name":"S7","email":"a@b.com"}'

echo "=== GSTIN structure ==="
check "reject 15 Z's"               400 POST /suppliers '{"name":"S8","gstin":"ZZZZZZZZZZZZZZZ"}'
check "reject all zeros"            400 POST /suppliers '{"name":"S9","gstin":"000000000000000"}'
check "accept real GSTIN"           201 POST /suppliers '{"name":"S10","gstin":"24AAAAA0000A1Z5"}'

echo "=== Dates ==="
check "reject month 13"             400 POST /expenses '{"category":"Fuel","amount":100,"expenseDate":"2026-13-45"}'
check "reject Feb 31"               400 POST /expenses '{"category":"Fuel","amount":100,"expenseDate":"2026-02-31"}'
check "reject future date"          400 POST /expenses '{"category":"Fuel","amount":100,"expenseDate":"2099-01-01"}'
check "accept today"                201 POST /expenses "{\"category\":\"Fuel\",\"amount\":100,\"expenseDate\":\"$(date +%F)\"}"

echo "=== Numbers ==="
check "reject Infinity amount"      400 POST /expenses '{"category":"Fuel","amount":1e400,"expenseDate":"2026-08-01"}'
check "reject negative amount"      400 POST /expenses '{"category":"Fuel","amount":-50,"expenseDate":"2026-08-01"}'
check "reject absurd amount"        400 POST /expenses '{"category":"Fuel","amount":99999999999,"expenseDate":"2026-08-01"}'
check "accept normal amount"        201 POST /expenses '{"category":"Fuel","amount":1500.50,"expenseDate":"2026-08-01"}'

echo "=== Whitespace-only names ==="
check "reject '   ' supplier name"  400 POST /suppliers '{"name":"   "}'

echo "=== Search cap ==="
LONG=$(node -e "process.stdout.write('a'.repeat(5000))")
check "reject 5000-char search"     400 GET  "/suppliers?search=$LONG"

echo "=== dateFrom <= dateTo ==="
check "reject inverted range"       400 GET  "/expenses?dateFrom=2026-08-01&dateTo=2026-01-01"
check "accept valid range"          200 GET  "/expenses?dateFrom=2026-01-01&dateTo=2026-08-01"

echo "=== MONEY GUARD: invoice over-payment ==="
INV=$(curl -s -X POST "$API/invoices" "${H[@]}" -d '{"invoiceType":"bill","buyerName":"Test Buyer","items":[{"description":"Cement","quantity":10,"rate":100}]}' | jq_get "j.data.id")
if [ -n "$INV" ]; then
  echo "  (invoice total = 1000)"
  check "reject 1000000 against 1000" 400 POST "/invoices/$INV/payment" '{"amountReceived":1000000}'
  check "accept 500 against 1000"     200 POST "/invoices/$INV/payment" '{"amountReceived":500}'
  check "accept exact 1000"           200 POST "/invoices/$INV/payment" '{"amountReceived":1000}'
else
  echo "  FAIL  could not create invoice"; fail=$((fail+1))
fi
check "reject over-payment on create" 400 POST /invoices '{"invoiceType":"bill","buyerName":"B","amountReceived":999999,"items":[{"description":"X","quantity":1,"rate":10}]}'

echo "=== Invoice line discount > line value ==="
check "reject discount > line"      400 POST /invoices '{"invoiceType":"bill","buyerName":"B","items":[{"description":"X","quantity":2,"rate":100,"discountAmount":9999}]}'

echo "=== Invoice due date before invoice date ==="
check "reject dueDate < invoiceDate" 400 POST /invoices '{"invoiceType":"bill","buyerName":"B","invoiceDate":"2026-08-01","dueDate":"2026-07-01","items":[{"description":"X","quantity":1,"rate":10}]}'

echo "=== HSN ==="
check "reject non-numeric HSN"      400 POST /invoices '{"invoiceType":"tax","buyerName":"B","items":[{"description":"X","quantity":1,"rate":10,"hsnCode":"abc"}]}'
check "accept 4-digit HSN"          201 POST /invoices '{"invoiceType":"tax","buyerName":"B","items":[{"description":"X","quantity":1,"rate":10,"hsnCode":"2523"}]}'

echo "=== MONEY GUARD: salary advance ceiling ==="
W=$(curl -s -X POST "$API/attendance/workers" "${H[@]}" -d '{"name":"Test Worker","dailyWage":700}' | jq_get "j.data.id")
if [ -n "$W" ]; then
  echo "  (dailyWage 700 -> ceiling 255500)"
  check "reject 5000000 advance"    400 POST /salary/advances "{\"workerId\":\"$W\",\"amount\":5000000,\"advanceDate\":\"$(date +%F)\"}"
  check "accept 5000 advance"       201 POST /salary/advances "{\"workerId\":\"$W\",\"amount\":5000,\"advanceDate\":\"$(date +%F)\"}"
else
  echo "  FAIL  could not create worker"; fail=$((fail+1))
fi

echo "=== Payment mode vocabulary ==="
check "reject 'Bitcoin'"            400 POST /expenses '{"category":"X","amount":10,"expenseDate":"2026-08-01","paymentMode":"Bitcoin"}'
check "accept 'Cash'"               201 POST /expenses '{"category":"X","amount":10,"expenseDate":"2026-08-01","paymentMode":"Cash"}'
check "accept lowercase 'cash'"     201 POST /expenses '{"category":"X","amount":10,"expenseDate":"2026-08-01","paymentMode":"cash"}'

# Cleanup: removing the site cascades everything created above.
curl -s -X DELETE "$API/sites/$SITE" -H "authorization: Bearer $TOKEN" -o /dev/null
echo ""
echo "cleaned up test site"
echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
