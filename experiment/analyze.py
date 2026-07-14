#!/usr/bin/env python3
"""
Scrutari HCI Experiment Analysis Script
Usage: python3 experiment/analyze.py --data experiment/results.json
"""

import json
import math
import sys
import argparse
from pathlib import Path

def load_data(path):
    with open(path) as f:
        return json.load(f)

def paired_ttest(a, b):
    """Paired t-test for within-subjects design."""
    n = len(a)
    if n != len(b) or n < 3:
        return None, None, None
    diffs = [b[i] - a[i] for i in range(n)]
    mean_d = sum(diffs) / n
    var_d = sum((d - mean_d) ** 2 for d in diffs) / (n - 1)
    if var_d == 0:
        return None, None, None
    se = math.sqrt(var_d / n)
    t = mean_d / se
    # Approximate p-value from t-distribution (simplified â€” use scipy for production)
    df = n - 1
    p = 2 * (1 - approx_t_cdf(abs(t), df))
    cohens_d = mean_d / math.sqrt(var_d) if var_d > 0 else 0
    return t, p, cohens_d

def approx_t_cdf(t, df):
    """Approximate t-distribution CDF (Abramowitz & Stegun 26.7.1)."""
    # Use normal approximation for df > 30
    if df > 30:
        x = t * (1 - 1 / (4 * df))
        return 0.5 * (1 + math.erf(x / math.sqrt(2)))
    # Simplified: just use normal
    return 0.5 * (1 + math.erf(t / math.sqrt(2)))

def benjamini_hochberg(p_values, q=0.05):
    """Benjamini-Hochberg FDR correction."""
    m = len(p_values)
    sorted_idx = sorted(range(m), key=lambda i: p_values[i])
    sorted_p = [p_values[i] for i in sorted_idx]
    threshold = [(i + 1) / m * q for i in range(m)]
    max_k = -1
    for i in range(m):
        if sorted_p[i] <= threshold[i]:
            max_k = i
    rejected = [False] * m
    for i in range(max_k + 1):
        rejected[sorted_idx[i]] = True
    return rejected

def analyze(data):
    """Run the full analysis pipeline."""
    results = {
        'sample_size': len(data),
        'hypotheses': {},
        'descriptive': {},
        'bh_correction': {},
    }

    # Extract scores by version
    a_comp = [d['conditionA']['comprehension_score'] for d in data if 'conditionA' in d]
    b_comp = [d['conditionB']['comprehension_score'] for d in data if 'conditionB' in d]
    a_tlx = [d['conditionA']['nasa_tlx_mean'] for d in data if 'conditionA' in d]
    b_tlx = [d['conditionB']['nasa_tlx_mean'] for d in data if 'conditionB' in d]
    preferences = [d.get('preference') for d in data if d.get('preference')]
    a_seq = [d['conditionA']['seq'] for d in data if 'conditionA' in d]
    b_seq = [d['conditionB']['seq'] for d in data if 'conditionB' in d]

    # H1: Comprehension
    t, p, d = paired_ttest(a_comp, b_comp)
    results['hypotheses']['H1_comprehension'] = {
        'a_mean': sum(a_comp) / len(a_comp) if a_comp else None,
        'b_mean': sum(b_comp) / len(b_comp) if b_comp else None,
        't_statistic': t,
        'p_value': p,
        'cohens_d': d,
        'significant': p is not None and p < 0.05,
    }

    # H2: Task load (NASA-TLX)
    t, p, d = paired_ttest(a_tlx, b_tlx)
    results['hypotheses']['H2_task_load'] = {
        'a_mean': sum(a_tlx) / len(a_tlx) if a_tlx else None,
        'b_mean': sum(b_tlx) / len(b_tlx) if b_tlx else None,
        't_statistic': t,
        'p_value': p,
        'cohens_d': d,
        'significant': p is not None and p < 0.05,
    }

    # H3: Preference
    pref_b = preferences.count('B') if preferences else 0
    pref_a = preferences.count('A') if preferences else 0
    total_pref = len(preferences)
    results['hypotheses']['H3_preference'] = {
        'prefer_a': pref_a,
        'prefer_b': pref_b,
        'prefer_neither': total_pref - pref_a - pref_b,
        'proportion_b': pref_b / total_pref if total_pref > 0 else None,
    }

    # BH correction
    p_vals = [
        results['hypotheses']['H1_comprehension'].get('p_value'),
        results['hypotheses']['H2_task_load'].get('p_value'),
    ]
    p_vals = [p for p in p_vals if p is not None]
    if p_vals:
        rejected = benjamini_hochberg(p_vals)
        results['bh_correction'] = {
            'q': 0.05,
            'p_values': p_vals,
            'rejected': rejected,
        }

    # Descriptive stats
    results['descriptive'] = {
        'age_distribution': {},
        'expertise_mean': None,
        'seq_a': sum(a_seq) / len(a_seq) if a_seq else None,
        'seq_b': sum(b_seq) / len(b_seq) if b_seq else None,
    }

    return results

def print_report(results):
    """Print formatted report."""
    print("=" * 60)
    print("  SCRUTARI HCI EXPERIMENT RESULTS")
    print("=" * 60)
    print(f"\nSample size: N={results['sample_size']}")

    print("\n--- PRIMARY HYPOTHESIS (Comprehension) ---")
    h1 = results['hypotheses']['H1_comprehension']
    print(f"  Version A mean: {h1['a_mean']:.2f}")
    print(f"  Version B mean: {h1['b_mean']:.2f}")
    if h1['t_statistic']:
        print(f"  Paired t({results['sample_size'] - 1}) = {h1['t_statistic']:.3f}")
        print(f"  p = {h1['p_value']:.4f}")
        print(f"  d = {h1['cohens_d']:.2f}")
        print(f"  {'âœ… SIGNIFICANT' if h1['significant'] else 'âŒ Not significant'}")

    print("\n--- SECONDARY (Task Load / NASA-TLX) ---")
    h2 = results['hypotheses']['H2_task_load']
    print(f"  Version A mean: {h2['a_mean']:.1f}")
    print(f"  Version B mean: {h2['b_mean']:.1f}")
    if h2['t_statistic']:
        print(f"  Paired t({results['sample_size'] - 1}) = {h2['t_statistic']:.3f}")
        print(f"  p = {h2['p_value']:.4f}")
        print(f"  d = {h2['cohens_d']:.2f}")
        print(f"  {'âœ… SIGNIFICANT' if h2['significant'] else 'âŒ Not significant'}")

    print("\n--- TERTIARY (Preference) ---")
    h3 = results['hypotheses']['H3_preference']
    print(f"  Prefer A: {h3['prefer_a']} ({h3['prefer_a'] / results['sample_size'] * 100:.0f}%)")
    print(f"  Prefer B: {h3['prefer_b']} ({h3['prefer_b'] / results['sample_size'] * 100:.0f}%)")
    print(f"  Neither:  {h3['prefer_neither']} ({h3['prefer_neither'] / results['sample_size'] * 100:.0f}%)")

    print("\n--- CORRECTIONS ---")
    bh = results['bh_correction']
    if bh:
        print(f"  Benjamini-Hochberg FDR (q={bh['q']}):")
        for i, (p, rej) in enumerate(zip(bh['p_values'], bh['rejected'])):
            print(f"    H{i + 1}: p={p:.4f} {'âœ… Survives' if rej else 'âŒ Does not survive'} correction")

    print("\n--- SUMMARY ---")
    sig_count = sum(1 for h in results['hypotheses'].values() if h.get('significant'))
    print(f"  {sig_count}/{len(results['hypotheses'])} hypotheses supported\n")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Scrutari HCI Experiment Analysis')
    parser.add_argument('--data', help='Path to experiment results JSON')
    parser.add_argument('--demo', action='store_true', help='Run with demo data')
    args = parser.parse_args()

    if args.demo:
        # Generate demo data
        import random
        random.seed(42)
        demo = []
        for i in range(64):
            demo.append({
                'participantId': f'demo-{i}',
                'conditionA': {
                    'comprehension_score': random.gauss(3.2, 1.1),
                    'nasa_tlx_mean': random.gauss(42.3, 15.2),
                    'seq': random.randint(1, 7),
                },
                'conditionB': {
                    'comprehension_score': random.gauss(4.1, 0.9),
                    'nasa_tlx_mean': random.gauss(31.8, 12.7),
                    'seq': random.randint(3, 7),
                },
                'preference': random.choices(['A', 'B', 'Neither'], weights=[0.23, 0.66, 0.11])[0],
            })
        data = demo
        print("Using demo data (N=64, simulated)\n")
    else:
        data = load_data(args.data)

    results = analyze(data)
    print_report(results)

