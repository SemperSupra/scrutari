#!/usr/bin/env bash
# Weekly automated baseline collection
# Runs fingerprint + behavioral baselines against the live site
# and submits labeled data for longitudinal tracking.
#
# Schedule via cron (Linux/Mac) or Task Scheduler (Windows):
#   0 6 * * 1 cd /path/to/scrutari && bash automation/run-weekly-baselines.sh
#
# Or via Docker:
#   docker run --rm -v $(pwd):/scrutari node:20 bash /scrutari/automation/run-weekly-baselines.sh

set -euo pipefail

cd "$(dirname "$0")/.."
OUTDIR="automation/expected-results"
mkdir -p "$OUTDIR"

echo "=== Scrutari Weekly Baselines ==="
echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

# 1. Run fingerprint baselines against live site
echo "--- Fingerprint baselines ---"
node automation/baselines.mjs --live 2>&1 | tail -20

# 2. Run state machine tests (UI/UX validation)
echo ""
echo "--- State machine tests ---"
node automation/state-machine-tests.mjs --live 2>&1 | tail -8

# 3. Run honeypot tests
echo ""
echo "--- Honeypot tests ---"
node automation/honeypot-tests.mjs 2>&1 | tail -8

# 4. Generate weekly report
echo ""
echo "--- Weekly summary ---"
python3 -c "
import json, os
results_dir = 'automation/expected-results'

# Load baseline results
baselines = [f for f in os.listdir(results_dir) if f.endswith('.json') and 'headless' in f]
for f in sorted(baselines):
    with open(os.path.join(results_dir, f)) as fh:
        d = json.load(fh)
        score = d.get('botOrNot', {}).get('botProbability', 'N/A')
        print(f'  {f.replace(\".json\",\"\"):30s} {score}%')

# Load behavioral
for f in ['bot_behavioral__headless_chrome_.json', 'human-like_behavioral__headless_chrome_.json']:
    p = os.path.join(results_dir, f)
    if os.path.exists(p):
        with open(p) as fh:
            d = json.load(fh)
            print(f'  {f.replace(\".json\",\"\"):30s} {d.get(\"behavioralScore\", \"N/A\")}%')
"
echo ""
echo "=== Weekly baselines complete ==="
echo "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
