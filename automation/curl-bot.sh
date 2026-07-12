#!/usr/bin/env bash
# Scrutari Curl Baselines
# Measures what a non-JS HTTP client looks like to Bot-or-Not.
# These won't get JSON output (no JS), but we capture the raw HTML size
# and metadata for comparison.
#
# Usage: bash automation/curl-bot.sh
set -euo pipefail

OUTDIR="$(dirname "$0")/expected-results"
mkdir -p "$OUTDIR"
URL="${1:-http://127.0.0.1:8765}"

echo "=== Scrutari Curl Baselines ==="
echo ""

run_test() {
  local name="$1"
  local ua="$2"
  local outfile="$OUTDIR/curl_$(echo "$name" | tr 'A-Z ' 'a-z_').json"
  local accept="$3"

  echo "▶ $name"

  local headers
  headers=$(mktemp)

  local start=$(date +%s%N)
  local body
  body=$(curl -s -o /dev/null -w "%{size_download}" \
    -H "User-Agent: $ua" \
    -H "Accept: ${accept:-text/html}" \
    -H "Accept-Language: en-US,en;q=0.9" \
    "$URL/?format=json" 2>/dev/null)
  local end=$(date +%s%N)
  local ms=$(( (end - start) / 1000000 ))

  # Get HTTP status and response headers
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "User-Agent: $ua" \
    "$URL/?format=json" 2>/dev/null)

  # Save result
  cat > "$outfile" <<JSON
{
  "test": "$name",
  "url": "$URL/?format=json",
  "userAgent": "$ua",
  "httpStatus": $http_code,
  "bytesDownloaded": $body,
  "responseTimeMs": $ms,
  "note": "Curl does not execute JavaScript. JSON output requires a JS runtime.",
  "botOrNotRating": "N/A (no JS execution)",
  "botOrNotScore": 100,
  "botReason": "No JavaScript execution at all — bare HTTP client"
}
JSON
  echo "    ${body} bytes, ${ms}ms, HTTP ${http_code}"
  echo "    Bot-or-Not: 100% (no JS = pure bot)"
  echo "    → $outfile"
  echo ""
}

run_test "Curl bare" "curl/8.0" "text/html"
run_test "Curl Chrome UA" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" "text/html,application/xhtml+xml"
run_test "Curl Firefox UA" "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0" "text/html,application/xhtml+xml"
run_test "Curl mobile UA" "Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36" "text/html"

echo "=== Done ==="
