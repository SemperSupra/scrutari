#!/usr/bin/env bash
# Scrutari Local CI Runner
#
# Runs CI checks directly (no Docker containers needed).
# Use this to validate changes before committing to save GitHub Actions minutes.
#
# Usage:
#   bash ci-local.sh           # Run full CI (test + lint + python-ml + opsec)
#   bash ci-local.sh test      # Run only unit tests
#   bash ci-local.sh lint      # Run only lint checks
#   bash ci-local.sh python-ml # Verify Python ML dependencies
#   bash ci-local.sh opsec     # Run OPSEC regression suite
#   bash ci-local.sh all       # Full CI including IPv6 tests
#   bash ci-local.sh --act     # Run via nektos/act (Docker containers)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
JOB="${1:-ci}"

echo "═══════════════════════════════════════════════"
echo "  Scrutari Local CI Runner"
echo "  Date: $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "  Mode: $([ "$JOB" = "--act" ] && echo "Docker (act)" || echo "Direct (make)")"
echo "═══════════════════════════════════════════════"

cd "$REPO_DIR"

if [ "$JOB" = "--act" ]; then
  # act mode — runs in Docker containers (requires Docker Desktop)
  echo ""
  echo "Starting Docker-based CI with nektos/act..."
  echo ""
  shift  # remove --act, pass remaining args

  ARGS=""
  if [ $# -gt 0 ]; then
    ARGS="--job $1"
    echo "Running job: $1"
  fi

  # Determine Docker connection — prefer TCP for Docker Desktop
  if docker ps >/dev/null 2>&1; then
    DOCKER_HOST_VAR=""
  else
    # Try TCP on port 2375 (Docker Desktop often exposes this locally)
    if curl -s http://localhost:2375/_ping >/dev/null 2>&1; then
      DOCKER_HOST_VAR="tcp://localhost:2375"
    elif [ -S "/var/run/docker.sock" ]; then
      DOCKER_HOST_VAR="unix:///var/run/docker.sock"
    else
      echo "ERROR: Cannot connect to Docker. Start Docker Desktop or use direct mode (no --act)."
      exit 1
    fi
  fi

  DOCKER_HOST=$DOCKER_HOST_VAR act \
    --container-architecture linux/amd64 \
    --action-offline-mode \
    --pull=false \
    $ARGS

elif command -v make >/dev/null 2>&1; then
  # make mode — run checks directly
  make "$JOB"
else
  # fallback — run checks directly
  echo ""
  case "$JOB" in
    test)
      echo "[TEST] Running all unit tests..."
      find test -name '*.test.mjs' -exec node --test {} + || exit 1
      echo "[PASS] All unit tests passed"
      ;;
    lint)
      echo "[LINT] Checking .gitignore..."
      ! grep -q "package.json" .gitignore || { echo "[FAIL] package.json in .gitignore"; exit 1; }
      echo "[LINT] Checking Docker SHA pinning..."
      ! grep -q "^FROM node:20-alpine$" submit-endpoint/Dockerfile || { echo "[FAIL] Unpinned Docker image"; exit 1; }
      echo "[LINT] Checking IPv4 hardcoding..."
      # Check for IPv4-as-default (BASE = 127.0.0.1), not control endpoints
      ! grep -q "^const BASE = .*127\.0\.0\.1" automation/ipv6-test.mjs || { echo "[FAIL] IPv4 hardcoded as base URL in test"; exit 1; }
      echo "[LINT] No IPv4 hardcoding in test files"
      echo "[PASS] All lint checks passed"
      ;;
    python-ml)
      echo "[ML] Verifying Python imports..."
      python3 -c "import numpy; print('numpy', numpy.__version__); import sklearn; print('sklearn', sklearn.__version__); import onnx; print('onnx', onnx.__version__)"
      echo "[PASS] Python ML imports OK"
      ;;
    opsec)
      echo "[OPSEC] Running regression suite..."
      node --test test/opsec-regression.test.mjs
      echo "[PASS] OPSEC regression passed"
      ;;
    ci|all)
      echo "[TEST] Running all unit tests..."
      find test -name '*.test.mjs' -exec node --test {} + || exit 1
      echo "[PASS] All unit tests passed"
      echo ""
      echo "[LINT] Checking .gitignore..."
      ! grep -q "package.json" .gitignore || { echo "[FAIL] package.json in .gitignore"; exit 1; }
      echo "[LINT] Checking Docker SHA pinning..."
      ! grep -q "^FROM node:20-alpine$" submit-endpoint/Dockerfile || { echo "[FAIL] Unpinned Docker image"; exit 1; }
      echo "[LINT] Checking IPv4 hardcoding..."
      # Check for IPv4-as-default (BASE = 127.0.0.1), not control endpoints
      ! grep -q "^const BASE = .*127\.0\.0\.1" automation/ipv6-test.mjs || { echo "[FAIL] IPv4 hardcoded as base URL in test"; exit 1; }
      echo "[LINT] No IPv4 hardcoding in test files"
      echo "[PASS] All lint checks passed"
      echo ""
      echo "[ML] Verifying Python imports..."
      if python3 -c "import numpy; import sklearn; import onnx; print('numpy', numpy.__version__); print('sklearn', sklearn.__version__); print('onnx', onnx.__version__)" 2>/dev/null; then
        echo "[PASS] Python ML imports OK"
      else
        echo "[INFO] Python ML deps not installed locally (run: pip install -r automation/training/requirements.txt)"
        echo "[INFO] This is non-fatal — CI in GitHub Actions will install them"
      fi
      echo ""
      echo "[OPSEC] Running regression suite..."
      node --test test/opsec-regression.test.mjs || exit 1
      echo "[PASS] OPSEC regression passed"
      echo ""
      echo "═══════════════════════════════════════════════"
      echo "  ✅  Full CI pipeline passed"
      echo "═══════════════════════════════════════════════"
      ;;
    *)
      echo "Usage: $0 [test|lint|python-ml|opsec|ci|all|--act]"
      exit 1
      ;;
  esac
fi

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo "═══════════════════════════════════════════════"
  echo "  ✅  CI passed"
  echo "═══════════════════════════════════════════════"
else
  echo "═══════════════════════════════════════════════"
  echo "  ❌  CI failed (exit code: $EXIT_CODE)"
  echo "═══════════════════════════════════════════════"
fi

exit $EXIT_CODE
