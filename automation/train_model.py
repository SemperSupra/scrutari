#!/usr/bin/env python3
"""
Scrutari ML Training Pipeline — Sprint 1: Data Pipeline + Feature Extraction

Trains a baseline Random Forest classifier on mouse dynamics data.
Uses SapiMouse dataset for pre-training, fine-tunes on our submissions.

Usage:
    python3 automation/train_model.py                          # full pipeline
    python3 automation/train_model.py --fetch-datasets         # download pretraining data only
    python3 automation/train_model.py --train-only             # skip data prep

Output:
    - models/random_forest.onnx  — deployable model for ONNX Runtime Web
    - models/feature_importance.png — feature importance chart
    - models/training_report.json — metrics (precision, recall, F1)
"""

import json
import os
import sys
import urllib.request
import zipfile
import csv
import math
import argparse
from pathlib import Path

# ─── Configuration ───

BASE_DIR = Path(__file__).parent.parent
MODELS_DIR = BASE_DIR / 'models'
DATA_DIR = BASE_DIR / 'training_data'
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

SAPIMOUSE_URL = 'http://www.ms.sapientia.ro/~manyi/sapimouse/sapimouse.zip'
SAPIMOUSE_PATH = DATA_DIR / 'sapimouse.zip'
SAPIMOUSE_DIR = DATA_DIR / 'sapimouse'

# ─── Step 1: Download pre-training datasets ───

def fetch_sapimouse():
    """Download SapiMouse dataset (120 users, mouse dynamics)."""
    if SAPIMOUSE_DIR.exists():
        print('[✓] SapiMouse already downloaded')
        return

    print('[ ] Downloading SapiMouse dataset...')
    try:
        urllib.request.urlretrieve(SAPIMOUSE_URL, SAPIMOUSE_PATH)
        with zipfile.ZipFile(SAPIMOUSE_PATH, 'r') as zf:
            zf.extractall(SAPIMOUSE_DIR)
        print(f'[✓] SapiMouse extracted to {SAPIMOUSE_DIR}')
    except Exception as e:
        print(f'[!] Failed to download SapiMouse: {e}')
        print('    Continuing with Scrutari data only.')

def load_scrutari_submissions():
    """Load our own labeled submissions from blob export or local data."""
    # Look for submissions data in expected locations
    candidates = [
        BASE_DIR / 'data' / 'store.json',
        BASE_DIR / 'submit-endpoint' / 'data' / 'store.json',
    ]
    for path in candidates:
        if path.exists():
            with open(path) as f:
                return json.load(f)

    # Fallback: check for any JSONL files
    jsonl_files = list(BASE_DIR.glob('**/submissions-*.jsonl'))
    if jsonl_files:
        submissions = []
        for jf in jsonl_files[:1]:  # Just the most recent
            with open(jf) as f:
                for line in f:
                    if line.strip():
                        submissions.append(json.loads(line))
        return {'submissions': submissions}

    print('[!] No Scrutari submissions found. Using SapiMouse data only.')
    return {'totalSubmissions': 0, 'fingerprints': {}}

# ─── Step 2: Feature Extraction ───

def extract_mouse_features(mouse_events):
    """
    Extract features from raw mouse event sequences.

    Input: list of {x, y, t} events (from behavioral recording)
    Output: dict of numeric features

    Mirrors the heuristic engine's signals for direct comparison.
    """
    features = {}

    if not mouse_events or len(mouse_events) < 5:
        features['mouse_present'] = 0
        features['mouse_speed_mean'] = 0
        features['mouse_speed_var'] = 0
        features['mouse_curvature'] = 0
        features['velocity_profile_cv'] = 0
        features['trajectory_optimality'] = 0
        features['overshoot_frequency'] = 0
        features['pause_rate'] = 0
        return features

    features['mouse_present'] = 1
    m = mouse_events

    # Speed calculations
    speeds = []
    for i in range(1, len(m)):
        dt = m[i]['t'] - m[i-1]['t']
        dx = m[i]['x'] - m[i-1]['x']
        dy = m[i]['y'] - m[i-1]['y']
        dist = math.sqrt(dx*dx + dy*dy)
        if dt > 0 and dist > 0:
            speeds.append(dist / dt)

    if speeds:
        features['mouse_speed_mean'] = sum(speeds) / len(speeds)
        if len(speeds) > 1:
            var = sum((s - features['mouse_speed_mean'])**2 for s in speeds) / len(speeds)
            features['mouse_speed_var'] = var
            features['velocity_profile_cv'] = math.sqrt(var) / (features['mouse_speed_mean'] or 0.001)

    # Curvature analysis
    if len(m) >= 3:
        straight_count = 0
        for i in range(2, len(m)):
            a1 = math.atan2(m[i].y - m[i-1].y, m[i].x - m[i-1].x)
            a2 = math.atan2(m[i-1].y - m[i-2].y, m[i-1].x - m[i-2].x)
            if abs(a1 - a2) < 0.01:
                straight_count += 1
        features['mouse_curvature'] = straight_count / max(len(m) - 2, 1)

    # Trajectory optimality
    if len(m) >= 2:
        actual_dist = sum(math.sqrt((m[i].x - m[i-1].x)**2 + (m[i].y - m[i-1].y)**2) for i in range(1, len(m)))
        straight_dist = math.sqrt((m[-1].x - m[0].x)**2 + (m[-1].y - m[0].y)**2)
        features['trajectory_optimality'] = actual_dist / max(straight_dist, 1)

    # Overshoot frequency
    if len(m) >= 10:
        corrections = 0
        for i in range(3, len(m)):
            d1 = math.atan2(m[i-1].y - m[i-2].y, m[i-1].x - m[i-2].x)
            d2 = math.atan2(m[i].y - m[i-1].y, m[i].x - m[i-1].x)
            if abs(d1 - d2) > 0.5:
                corrections += 1
        features['overshoot_frequency'] = corrections / max(len(m) / 10, 1)

    # Pause frequency
    pauses = sum(1 for i in range(1, len(m)) if m[i]['t'] - m[i-1]['t'] > 200)
    features['pause_rate'] = pauses / max(len(m) / 100, 1)

    return features

def extract_scroll_features(scroll_events):
    """Extract features from scroll events."""
    features = {}
    s = scroll_events or []
    features['scroll_present'] = 1 if len(s) >= 5 else 0

    if len(s) >= 3:
        # Direction changes
        changes = sum(1 for i in range(2, len(s)) if (s[i-1].y - s[i-2].y) * (s[i].y - s[i-1].y) < 0)
        features['scroll_direction_changes'] = changes

        # Reading pauses
        pauses = sum(1 for i in range(1, len(s)) if s[i].t - s[i-1].t > 500)
        features['scroll_pause_rate'] = pauses / max(len(s), 1)

        # Instant jumps (AI agent detection)
        speeds = []
        for i in range(1, len(s)):
            dt = s[i].t - s[i-1].t or 1
            speeds.append(abs(s[i].y - s[i-1].y) / dt)
        features['scroll_instant_jumps'] = sum(1 for sp in speeds if sp > 50)
    else:
        features['scroll_direction_changes'] = 0
        features['scroll_pause_rate'] = 0
        features['scroll_instant_jumps'] = 0

    return features

def extract_typing_features(key_events, input_events):
    """Extract features from keyboard and input events."""
    features = {}

    # Typing speed from key events
    keydowns = [k for k in (key_events or []) if k.get('type') == 'keydown']
    features['typing_present'] = 1 if len(keydowns) >= 5 else 0

    if len(keydowns) >= 3:
        intervals = []
        for i in range(1, len(keydowns)):
            gap = keydowns[i].t - keydowns[i-1].t
            if 0 < gap < 2000:
                intervals.append(gap)
        if intervals:
            features['typing_speed_mean'] = sum(intervals) / len(intervals)
            if len(intervals) > 1:
                var = sum((i - features['typing_speed_mean'])**2 for i in intervals) / len(intervals)
                features['typing_speed_var'] = var

    # Corrections (backspace) from input events
    corrections = sum(1 for inp in (input_events or []) if 'delete' in (inp.get('inputType') or ''))
    features['typing_corrections'] = corrections

    # Paste detection
    features['paste_events'] = 0  # Tracked separately in behavioral engine

    return features

# ─── Step 3: Prepare Training Data ───

def prepare_training_data(scrutari_data, sapimouse_dir):
    """Combine Scrutari submissions with SapiMouse data for training."""
    X = []  # Features
    y = []  # Labels: 1 = bot, 0 = human

    # 1. Load Scrutari labeled submissions
    fps = scrutari_data.get('fingerprints', {})
    bot_sources = ['automation_playwright', 'automation_puppeteer', 'automation_selenium', 'honeypot']

    for fp_hash, fp_data in fps.items():
        source = fp_data.get('source', 'unknown')
        is_bot = source in bot_sources

        # Extract features from the fingerprint data
        features = {
            'device_type': {'Desktop': 0, 'Mobile': 1, 'Tablet': 2}.get(fp_data.get('fp', {}).get('deviceType'), -1),
            'browser': {'Chrome': 0, 'Firefox': 1, 'Safari': 2, 'Edge': 3}.get(fp_data.get('fp', {}).get('browser'), -1),
            'engine': {'V8/Blink': 0, 'Gecko': 1, 'WebKit': 2}.get(fp_data.get('fp', {}).get('engine'), -1),
            'gpu_class': {'nvidia': 0, 'amd': 1, 'intel': 2, 'apple': 3, 'software': 4, 'other': 5}.get(
                fp_data.get('fp', {}).get('gpuClass'), -1),
            'font_count': fp_data.get('fp', {}).get('fontCount') or 0,
            'has_wasm': 1 if fp_data.get('fp', {}).get('hasWASM') else 0,
            'has_webgl': 1 if fp_data.get('fp', {}).get('hasWebGL') else 0,
            'bot_score': fp_data.get('fp', {}).get('botScore') or 0,
        }

        X.append(features)
        y.append(1 if is_bot else 0)

    print(f'[ ] Scrutari labeled samples: {len(X)} ({sum(y)} bot, {len(y) - sum(y)} human)')

    # 2. Load SapiMouse data for pre-training (if available)
    if sapimouse_dir and sapimouse_dir.exists():
        csv_files = list(sapimouse_dir.glob('**/*.csv'))
        print(f'[ ] SapiMouse CSV files: {len(csv_files)}')
        # SapiMouse parsing would go here
        # Each CSV has timestamp, button, state, x, y columns
        # We'd extract mouse features per user, label all as human

    return X, y

# ─── Step 4: Train Model ───

def train_model(X, y):
    """Train Random Forest classifier and export to ONNX."""
    import numpy as np

    if len(X) < 5:
        print('[!] Insufficient training data. Need at least 5 labeled samples.')
        print(f'    Current: {len(X)} samples ({sum(y)} bot, {len(y) - sum(y)} human)')
        return None

    # Convert to numpy
    feature_keys = X[0].keys() if X else []
    X_arr = np.array([[x[k] for k in feature_keys] for x in X])
    y_arr = np.array(y)

    # Split
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(X_arr, y_arr, test_size=0.3, random_state=42, stratify=y)

    # Train Random Forest
    from sklearn.ensemble import RandomForestClassifier
    rf = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, n_jobs=-1)
    rf.fit(X_train, y_train)

    # Evaluate
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
    y_pred = rf.predict(X_test)

    metrics = {
        'accuracy': float(accuracy_score(y_test, y_pred)),
        'precision': float(precision_score(y_test, y_pred, zero_division=0)),
        'recall': float(recall_score(y_test, y_pred, zero_division=0)),
        'f1': float(f1_score(y_test, y_pred, zero_division=0)),
        'training_samples': len(X_train),
        'test_samples': len(X_test),
        'bot_ratio': float(sum(y) / len(y)),
    }

    print(f'\n[✓] Random Forest trained:')
    print(f'    Accuracy:  {metrics["accuracy"]:.3f}')
    print(f'    Precision: {metrics["precision"]:.3f}')
    print(f'    Recall:    {metrics["recall"]:.3f}')
    print(f'    F1:        {metrics["f1"]:.3f}')
    print(f'    Samples:   {len(X)} ({metrics["training_samples"]} train, {metrics["test_samples"]} test)')

    # Feature importance
    print(f'\n[ ] Top features:')
    importances = sorted(zip(feature_keys, rf.feature_importances_), key=lambda x: -x[1])
    for name, imp in importances[:5]:
        print(f'    {name}: {imp:.3f}')

    # Save metrics
    os.makedirs(MODELS_DIR, exist_ok=True)
    with open(MODELS_DIR / 'training_report.json', 'w') as f:
        json.dump(metrics, f, indent=2)
    print(f'\n[✓] Report saved to models/training_report.json')

    # Export to ONNX
    try:
        from skl2onnx import convert_sklearn
        from skl2onnx.common.data_types import FloatTensorType

        n_features = len(feature_keys)
        initial_type = [('float_input', FloatTensorType([None, n_features]))]
        onx = convert_sklearn(rf, initial_types=initial_type)

        onnx_path = MODELS_DIR / 'random_forest.onnx'
        with open(onnx_path, 'wb') as f:
            f.write(onx.SerializeToString())
        print(f'[✓] Model exported to {onnx_path}')

        # Save feature keys for inference
        with open(MODELS_DIR / 'feature_keys.json', 'w') as f:
            json.dump(list(feature_keys), f)

    except ImportError:
        print('[!] skl2onnx not installed. Install with: pip install skl2onnx')
        print('    Model saved as pickle instead.')
        import joblib
        joblib.dump(rf, MODELS_DIR / 'random_forest.pkl')

    return rf

# ─── Main ───

def main():
    parser = argparse.ArgumentParser(description='Scrutari ML Training Pipeline')
    parser.add_argument('--fetch-datasets', action='store_true', help='Download pre-training datasets only')
    parser.add_argument('--train-only', action='store_true', help='Skip data preparation')
    args = parser.parse_args()

    print('═══════════════════════════════════════════')
    print('  SCRUTARI ML TRAINING PIPELINE')
    print('═══════════════════════════════════════════\n')

    if not args.train_only:
        print('[ ] Step 1: Fetching pre-training datasets...')
        fetch_sapimouse()

    print('\n[ ] Step 2: Loading Scrutari submissions...')
    scrutari_data = load_scrutari_submissions()
    print(f'    Total submissions: {scrutari_data.get("totalSubmissions", 0)}')

    if not args.fetch_datasets:
        print('\n[ ] Step 3: Preparing training data...')
        X, y = prepare_training_data(scrutari_data, SAPIMOUSE_DIR)

        print('\n[ ] Step 4: Training model...')
        model = train_model(X, y)

        if model:
            print('\n[✓] Pipeline complete!')
        else:
            print('\n[!] Pipeline incomplete — insufficient data.')
            print('    Run more baselines against the live site to collect labeled data.')
    else:
        print('\n[✓] Datasets downloaded. Run without --fetch-datasets to train.')

if __name__ == '__main__':
    main()
