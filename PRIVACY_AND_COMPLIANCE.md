# Privacy & GDPR Compliance Assessment

## Current Data Flows

| Flow | Consented? | Personal Data? | Lawful Basis | Issue |
|------|:----------:|:--------------:|:------------:|-------|
| **SPA submission** (click Submit) | ✅ Checkbox consent | ❌ Anonymized | Consent (Art. 7) | ✅ OK |
| **Auto-submit from baselines** | ❌ N/A (bots) | ❌ Anonymized | Legitimate interest (Art. 6(1)(f)) | ⚠️ Document |
| **Honeypot JS tracking** (`hp_track`) | ❌ NO CONSENT | ❌ Anonymized | None documented | 🔴 CRITICAL |
| **Honeypot HTTP logging** (crawlers) | ❌ N/A (crawlers) | IP logged temporarily | Legitimate interest | ⚠️ Add retention |
| **Behavioral recording** (SPA) | ✅ User initiated | ❌ Never sent | Implicit consent | ✅ OK |

## Critical Issues

### 1. 🔴 Honeypot JS Tracking — No Consent

The `hp_track()` function in honeypot pages sends fingerprint data via `navigator.sendBeacon('/api/submit', ...)` without user knowledge or consent. This is the most serious issue.

**Fix needed:**
- Honeypot pages must display a privacy notice on first visit
- Tracking must be opt-in, not opt-out
- OR: tracking must be limited to known bots/crawlers (by User-Agent), not real users

### 2. 🟡 Data Retention — No Deletion Policy

Submissions are stored indefinitely in Netlify Blob with no expiration.

**Fix needed:**
- Add auto-deletion policy (e.g., 365 days for submissions, 30 days for raw logs)
- Add deletion endpoint for user requests

### 3. 🟡 Right to Erasure — No Mechanism

Users cannot request deletion of their data. The dedup hash prevents identification, but we still need a mechanism.

**Fix needed:**
- Add email contact for deletion requests
- Add automated deletion endpoint

### 4. 🟡 Privacy Policy — Missing

No privacy policy exists on the site or in the repository.

**Fix needed:**
- Add PRIVACY.md with full data processing details
- Link from SPA footer and honeypot pages

### 5. 🟡 International Transfers — US-based Infrastructure

Netlify is a US company. Data stored in US may require Standard Contractual Clauses.

**Fix needed:**
- Document SCCs with Netlify
- Note in privacy policy

## Recommended Actions

| Priority | Action | Timeline |
|:--------:|--------|:--------:|
| 🔴 | **Stop honeypot JS tracking immediately** or add privacy notice + consent | Today |
| 🔴 | Add privacy policy to SPA and honeypot pages | Today |
| 🟡 | Add data retention policy (365 days auto-delete) | This week |
| 🟡 | Add deletion request endpoint | This week |
| 🟢 | Document DPIA | This month |
| 🟢 | Add SCC documentation | This month |

## Implementation Checklist

### Privacy Policy (PRIVACY.md) — DONE
✅ This document exists

### Consent on Honeypot Pages — NEEDS WORK
- [ ] Add privacy notice banner on honeypot pages
- [ ] Make tracking opt-in (or stop automatic tracking)
- [ ] Log consent status in submissions

### Data Retention — NEEDS WORK
- [ ] Add `_retention` field to blob store entries
- [ ] Auto-delete entries older than 365 days
- [ ] Document retention period

### Deletion Endpoint — NEEDS WORK
- [ ] Add `POST /api/delete` endpoint
- [ ] Verifies identity via submission hash
- [ ] Removes entry from blob store

### Privacy Notice on SPA — NEEDS WORK
- [ ] Add link to PRIVACY.md in SPA footer
- [ ] Add "How we use your data" section

## Lawful Basis Documentation

### For automated submissions (baselines, honeypot crawlers):
**Legitimate Interest** (Article 6(1)(f))
- Purpose: Security research, bot detection improvement
- Necessity: Cannot collect data without automated tracking
- Balancing: Data is anonymized, no PII stored, no profiling

### For manual submissions (SPA users):
**Consent** (Article 7)
- Purpose: Research contribution
- Granularity: User checks consent checkbox before submission
- Withdrawable: User can request deletion
