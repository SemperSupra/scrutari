# Scrutari Automation — Bot-or-Not Baselines

Scripts for generating baseline Bot-or-Not ratings across different browser configurations. These are used to populate the "Benchmarks" section of the Scrutari SPA showing what real automation looks like.

**These scripts live in the private repo** because they use Playwright browser automation. The pre-computed results are checked in so the public SPA can display them without needing to run automation.

## Tests

| Test | What it simulates | Expected Bot-or-Not |
|------|-------------------|---------------------|
| `curl` | Bare HTTP client, no JS execution | 100% (pure bot) |
| Headless Chrome | Default Playwright headless | 65-80% |
| Headless Chrome (no GPU) | Server/VM environment | 70-85% |
| Headless Firefox | Default Playwright Firefox | 50-70% |
| Headless WebKit | Safari automation | 50-70% |
| Chrome mobile emulation | Pixel 5 in headless | 40-60% |
| Chrome desktop emulation | Windows Chrome with proper viewport | 20-40% |

## Usage

```bash
# 1. Start the test server
python3 automation/server.py &
sleep 1

# 2. Run curl baselines (quick)
bash automation/curl-bot.sh

# 3. Run Playwright baselines (slow — downloads browsers on first run)
node automation/baselines.mjs

# 4. Run with headed browser tests (requires display server)
node automation/baselines.mjs --headed

# 5. Reuse already-running server
node automation/baselines.mjs --server
```

## Output

Results are saved as JSON in `automation/expected-results/`:

```json
{
  "test": "Headless Chrome (default)",
  "userAgent": "Mozilla/5.0 ...",
  "botOrNot": {
    "botProbability": 72,
    "confidence": "High",
    "testsRun": 23,
    "testsTotal": 25,
    "results": [...]
  },
  "fingerprint": {...},
  "totalEntropyBits": 22.4
}
```

## Adding a new baseline

Add a test entry in `automation/baselines.mjs`, then run:

```bash
node automation/baselines.mjs --server
```

## Privacy

These scripts run locally. No data leaves your machine. The results capture what a remote server would see if this browser visited any website — they are the *fingerprint*, not the *identity*.
