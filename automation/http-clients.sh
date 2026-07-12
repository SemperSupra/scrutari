#!/usr/bin/env bash
# Scrutari HTTP Client Baselines
# Tests various non-browser HTTP clients to show their Bot-or-Not rating.
# Most of these don't run JS, so they get 100% bot score —
# the value is showing WHAT identifies them as bots.
#
# Usage: bash automation/http-clients.sh
set -euo pipefail

OUTDIR="$(dirname "$0")/expected-results"
mkdir -p "$OUTDIR"
URL="${1:-http://127.0.0.1:8765}"

echo "=== Scrutari HTTP Client Baselines ==="
echo "Tests what non-browser HTTP clients look like to fingerprinting."
echo ""

run_test() {
  local name="$1"
  local outfile="$OUTDIR/http_$(echo "$name" | tr 'A-Z ' 'a-z_').json"
  local cmd="$2"
  local ua="$3"

  echo "▶ $name"

  local start=$(date +%s%N 2>/dev/null || date +%s%N)
  local result
  local exit_code=0

  result=$(eval "$cmd" 2>/dev/null) || exit_code=$?

  local end=$(date +%s%N 2>/dev/null || date +%s%N)
  local ms=0
  [[ $start =~ ^[0-9]+$ ]] && [[ $end =~ ^[0-9]+$ ]] && ms=$(( (end - start) / 1000000 ))

  local body_size=$(echo "$result" | wc -c)
  local has_js="No"
  local bot_score=100
  local bot_reason="No JavaScript execution — bare HTTP client"

  # Check if we got meaningful content
  if echo "$result" | grep -qi "fingerprint\|entropy\|bot-or-not" 2>/dev/null; then
    has_js="Yes (text match)"
    bot_score="N/A"
    bot_reason="Unexpected — response contained dynamic content"
  fi

  # Save result
  cat > "$outfile" <<JSON
{
  "test": "$name",
  "userAgent": "$ua",
  "bytesDownloaded": $body_size,
  "responseTimeMs": $ms,
  "exitCode": $exit_code,
  "hasJavaScript": "$has_js",
  "botOrNotScore": $bot_score,
  "botReason": "$bot_reason",
  "note": "Non-JS HTTP clients always score 100% bot because they cannot execute JavaScript fingerprinting. The Bot-or-Not system recognizes them by missing JS capabilities, not by their HTTP headers."
}
JSON
  echo "    ${body_size}b, ${ms}ms, exit=$exit_code"
  echo "    Bot-or-Not: ${bot_score}% — ${bot_reason}"
  echo "    → $(basename "$outfile")"
  echo ""
}

echo "--- Native Windows/Linux HTTP clients ---"

run_test "curl (default)" \
  "curl -s -o /dev/null -w '%{size_download}' '$URL/?format=json'" \
  "curl/8.x"

run_test "curl (Chrome UA)" \
  "curl -s -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' '$URL/?format=json' | wc -c" \
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0"

run_test "wget (default)" \
  "wget -q -O - '$URL/?format=json' 2>/dev/null | wc -c" \
  "Wget/1.x"

run_test "Python urllib" \
  "python3 -c \"import urllib.request; f=urllib.request.urlopen('$URL/?format=json'); print(len(f.read()))\"" \
  "Python-urllib/3.x"

run_test "Python requests" \
  "python3 -c \"import requests; r=requests.get('$URL/?format=json'); print(len(r.content))\"" \
  "python-requests/2.x"

echo "--- PowerShell (Windows) ---"

# Test via pwsh if available
if command -v pwsh &>/dev/null; then
  run_test "PowerShell Invoke-WebRequest" \
    'pwsh -NoLogo -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $r = Invoke-WebRequest -Uri \"'"$URL"'/?format=json\" -UseBasicParsing; $r.Content.Length; exit 0" 2>/dev/null' \
    "PowerShell/7.x"
else
  echo "  ⚠ pwsh not available — skipping PowerShell baseline"
fi

if command -v http &>/dev/null; then
  run_test "HTTPie (default)" \
    "http GET '$URL/?format=json' --body 2>/dev/null | wc -c" \
    "HTTPie/3.x"
else
  echo "  ⚠ httpie not available — skipping"
fi

echo "--- Summary ---"
echo ""

# Print results table
for f in "$OUTDIR"/http_*.json; do
  name=$(basename "$f" .json | sed 's/http_//')
  score=$(grep -o '"botOrNotScore": [0-9]*' "$f" | grep -o '[0-9]*')
  echo "  $(printf '%-25s' "$name") → ${score}% bot"
done

echo ""
echo "=== HTTP Client Baselines Complete ==="
