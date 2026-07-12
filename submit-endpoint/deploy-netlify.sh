#!/usr/bin/env bash
# Scrutari Submission Endpoint — Netlify Deploy Script
#
# Automates deployment of the submission endpoint to Netlify.
# Uses Netlify Blob Storage (free tier: 1GB, 1M req/mo).
#
# Prerequisites:
#   1. Netlify CLI: npm install -g netlify-cli
#   2. Netlify account: npx netlify login
#   3. A Netlify site (created automatically if --new flag used)
#
# Usage:
#   ./deploy-netlify.sh                          # deploy to existing site
#   ./deploy-netlify.sh --new                     # create new site + deploy
#   ./deploy-netlify.sh --prod                    # deploy to production
#
# After deployment:
#   Your endpoint URL: https://YOUR-SITE.netlify.app/api/submit
#   Configure the SPA: localStorage.setItem('scrutari_endpoint', 'https://YOUR-SITE.netlify.app/api/submit')

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NETLIFY_DIR="$SCRIPT_DIR/netlify"
NEW_SITE=false
PROD_FLAG=""

# Parse args
for arg in "$@"; do
  case "$arg" in
    --new) NEW_SITE=true ;;
    --prod) PROD_FLAG="--prod" ;;
  esac
done

echo "=== Scrutari Netlify Deployment ==="
echo ""

# Check dependencies
if ! command -v npx &>/dev/null; then
  echo "Error: npx not found. Install Node.js first."
  exit 1
fi

# Check Netlify CLI
if ! npx netlify --version &>/dev/null 2>&1; then
  echo "Installing Netlify CLI..."
  npm install -g netlify-cli
fi

# Check login status
echo "Checking Netlify authentication..."
if ! npx netlify status &>/dev/null 2>&1; then
  echo "Please log in to Netlify:"
  npx netlify login
fi

# Create new site if requested
if [ "$NEW_SITE" = true ]; then
  echo "Creating new Netlify site..."
  SITE_NAME="scrutari-submit-$(date +%s)"
  npx netlify sites:create --name "$SITE_NAME" --manual
  echo "Site created: $SITE_NAME"
fi

# Deploy
echo ""
echo "Deploying to Netlify..."
cd "$NETLIFY_DIR"

# Enable Blob Storage (required for the function)
echo "Enabling Blob Storage..."
npx netlify blob:enable 2>/dev/null || echo "  (Blob Storage may already be enabled)"

# Deploy SPA + functions together
echo "Deploying from repo root (SPA + functions)..."
cd "$REPO_ROOT"
# Functions are in submit-endpoint/netlify/functions/
# Edge functions are in submit-endpoint/netlify/edge-functions/
# Config (netlify.toml) is in repo root for Netlify to find
cp "$NETLIFY_DIR/netlify.toml" "$REPO_ROOT/netlify.toml" 2>/dev/null || true
npx netlify deploy $PROD_FLAG \
  --dir . \
  --functions submit-endpoint/netlify/functions \
  --json 2>&1 | tee /tmp/netlify-deploy.log

# Extract and show the endpoint URL
DEPLOY_URL=$(grep -o 'https://[^"]*\.netlify\.app' /tmp/netlify-deploy.log | head -1)
if [ -n "$DEPLOY_URL" ]; then
  echo ""
  echo "=== Deployment Successful ==="
  echo "Endpoint URL: $DEPLOY_URL/api/submit"
  echo ""
  echo "Configure the SPA (paste in browser console):"
  echo "  localStorage.setItem('scrutari_endpoint', '$DEPLOY_URL/api/submit');"
  echo ""
  echo "Test:"
  echo "  curl -X POST $DEPLOY_URL/api/submit \\"
  echo '    -H "Content-Type: application/json" \'
  echo '    -d "{\"version\":1,\"source\":\"test\",\"botScore\":50}"'
else
  echo ""
  echo "=== Deployment completed ==="
  echo "Check the URL above for your endpoint."
  echo "Run: npx netlify deploy --prod to promote to production."
fi
