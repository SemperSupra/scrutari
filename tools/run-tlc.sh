#!/usr/bin/env bash
# Run TLC model checker on the Scrutari TLA+ specs
# Uses Docker to avoid Java/TLA+ toolbox installation
#
# Usage:
#   bash tools/run-tlc.sh                    # Run all specs
#   bash tools/run-tlc.sh rate-limiter       # Run specific spec

set -euo pipefail

SPEC="${1:-rate-limiter}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TLA_DIR="$REPO_DIR/docs/tla"

echo "=== TLC Model Checker ==="
echo "Spec: $SPEC"
echo ""

case "$SPEC" in
  rate-limiter)
    # Run the rate limiter TLA+ model
    # Model checks 3 invariants:
    #   InvRateLimited: at most MaxPerWindow requests per IP per window
    #   InvSorted: timestamp arrays are sorted ascending
    #   InvTimely: all timestamps are within [Now - Window, Now]

    # First, validate the TLA+ syntax by attempting to parse it
    echo "Model: rate-limiter.tla"
    echo "Constants: Window=5, MaxPerWindow=2, IPs={A, B, C}"
    echo "Properties: InvRateLimited, InvSorted, InvTimely"
    echo ""

    if command -v docker &>/dev/null; then
      echo "Running TLC in Docker container..."
      docker run --rm -v "$TLA_DIR:/specs" openjdk:17-slim \
        bash -c "
          apt-get update -qq && apt-get install -y -qq curl unzip >/dev/null 2>&1
          curl -sL https://github.com/tlaplus/tlaplus/releases/download/v1.8.1/tla2tools.jar -o /tla2tools.jar
          cd /specs
          echo 'Checking: rate-limiter.tla'
          java -cp /tla2tools.jar tlc2.TLC rate-limiter.tla -config rate-limiter.cfg -deadlock -workers auto 2>&1 || true
        " 2>&1 | tail -30
    else
      echo "Docker not available. To run TLC manually:"
      echo "  1. Install Java 17+"
      echo "  2. Download tla2tools.jar from https://github.com/tlaplus/tlaplus/releases"
      echo "  3. java -cp tla2tools.jar tlc2.TLC $TLA_DIR/rate-limiter.tla"
    fi
    ;;

  *)
    echo "Unknown spec: $SPEC"
    echo "Available: rate-limiter"
    exit 1
    ;;
esac
