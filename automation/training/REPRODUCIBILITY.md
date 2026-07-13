# Reproducibility Guide

## Build

```bash
cd automation/training
docker compose build
```

## Train

```bash
cd automation/training
docker compose run --rm trainer
```

## Verify

```bash
# Check the output model
ls -la ../../models/random_forest.onnx

# Check training report
cat ../../models/training_report.json
```

## Expected Output

```
models/
  random_forest.onnx   — ONNX model (deterministic given same data)
  feature_keys.json     — Feature names in order
  training_report.json  — Metrics (accuracy, precision, recall, F1)
```

## Version Pinning

All dependencies are SHA-pinned in Dockerfile:
- python:3.12-slim (SHA256: 8cf4d98c12bb...)
- numpy==2.2.5
- scikit-learn==1.9.0
- onnx==1.22.0
- skl2onnx==1.20.0
- PYTHONHASHSEED=42 (deterministic hash randomization)

## Data Requirements

- `data/store.json` — Exported blob from Netlify
- `training_data/sapimouse/` — SapiMouse dataset (120 users)

## Reproducing

```bash
# Same commit + same data = same model
docker compose run --rm trainer
# Output: models/random_forest.onnx (bit-for-bit identical on same platform)
```
