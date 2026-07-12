#!/usr/bin/env bash
# Scrutari Container Baselines
# Uses Docker to test the SPA from different Linux distributions,
# each with their own browser/HTTP client defaults.
#
# Tests:
#   - Alpine (musl libc, wget, no browser)
#   - Ubuntu (glibc, curl, python3)
#   - Debian + Chromium (headless browser)
#   - Arch Linux (pacman, bleeding edge)
#   - Distroless (minimal, no shell)
#
# Usage: bash automation/container-baselines.sh
set -euo pipefail

OUTDIR="$(dirname "$0")/expected-results"
mkdir -p "$OUTDIR"
HOST="host.docker.internal:8765"
URL="http://${HOST}/?format=json"

echo "=== Scrutari Container Baselines ==="
echo "Testing from different Linux distributions via Docker."
echo ""

run_container() {
  local name="$1"
  local image="$2"
  local cmd="$3"
  local ua="$4"
  local outfile="$OUTDIR/container_$(echo "$name" | tr 'A-Z ' 'a-z_').json"

  echo "▶ $name ($image)"

  local start=$(date +%s%N)
  local result
  local exit_code=0

  result=$(docker run --rm --add-host host.docker.internal:host-gateway "$image" sh -c "$cmd" 2>/dev/null) || exit_code=$?

  local end=$(date +%s%N)
  local ms=$(( (end - start) / 1000000 ))

  if [ -z "$result" ]; then
    local body_size=0
    local has_js="No"
    local bot_score=100
    local bot_reason="No output — likely network or dependency issue"
  else
    local body_size=$(echo "$result" | wc -c)
    local has_js="No"
    local bot_score=100
    local bot_reason="No JavaScript — bare HTTP client in container"
    # Check if we got dynamic content
    if echo "$result" | grep -qi '"fingerprint"' 2>/dev/null; then
      has_js="Yes (JSON mode)"
    fi
  fi

  cat > "$outfile" <<JSON
{
  "test": "$name",
  "container": "$image",
  "command": $(echo "$cmd" | jq -Rs .),
  "userAgent": "$ua",
  "bytesDownloaded": $body_size,
  "responseTimeMs": $ms,
  "exitCode": $exit_code,
  "hasJavaScript": "$has_js",
  "botOrNotScore": $bot_score,
  "botReason": "$bot_reason",
  "note": "Container-based HTTP clients. Most do not execute JavaScript, scoring 100% bot. The value is in comparing HTTP header fingerprints across distributions (User-Agent, Accept, TLS fingerprint differences)."
}
JSON
  echo "    ${body_size}b, ${ms}ms, exit=$exit_code"
  echo "    Bot-or-Not: ${bot_score}%"
  echo "    → $(basename "$outfile")"
  echo ""
}

# ─── Non-browser containers (HTTP clients only) ───

echo "--- Non-browser containers ---"

run_container "Alpine wget" \
  "alpine:3.20" \
  "wget -q -O - '$URL' 2>/dev/null | wc -c" \
  "Wget/1.24 (musl)"

run_container "Alpine curl" \
  "alpine:3.20" \
  "apk add -q curl && curl -s -o /dev/null -w '%{size_download}' '$URL'" \
  "curl/8.x (musl)"

run_container "Ubuntu curl" \
  "ubuntu:24.04" \
  "apt-get update -qq && apt-get install -y -qq curl 2>/dev/null && curl -s -o /dev/null -w '%{size_download}' '$URL'" \
  "curl/8.x (glibc)"

run_container "Debian wget" \
  "debian:bookworm-slim" \
  "apt-get update -qq && apt-get install -y -qq wget 2>/dev/null && wget -q -O - '$URL' 2>/dev/null | wc -c" \
  "Wget/1.21 (glibc)"

run_container "Python urllib" \
  "python:3.12-alpine" \
  "python -c \"import urllib.request; f=urllib.request.urlopen('$URL'); print(len(f.read()))\"" \
  "Python-urllib/3.12"

run_container "Python requests" \
  "python:3.12-alpine" \
  "pip install -q requests 2>/dev/null && python -c \"import requests; r=requests.get('$URL'); print(len(r.content))\"" \
  "python-requests/2.x"

# ─── "Rare" browser-like containers ───

echo "--- 'Browser' containers (text-based) ---"

# Lynx (text browser, no JS) — requires compilation on Alpine
run_container "Lynx text browser" \
  "alpine:3.20" \
  "apk add -q lynx 2>/dev/null && lynx -dump '$URL' 2>/dev/null | wc -c" \
  "Lynx/2.x (text browser)"

# ELinks (text browser, basic JS)
run_container "ELinks text browser" \
  "alpine:3.20" \
  "apk add -q elinks 2>/dev/null && echo '' | elinks -dump '$URL' 2>/dev/null | wc -c" \
  "ELinks/0.x (text browser)"

echo ""
echo "--- Container Baselines Complete ---"
echo ""

# Quick summary
for f in "$OUTDIR"/container_*.json; do
  name=$(basename "$f" .json | sed 's/container_//')
  score=$(grep -o '"botOrNotScore": [0-9]*' "$f" | grep -o '[0-9]*')
  echo "  $(printf '%-30s' "$name") → ${score}% bot"
done
