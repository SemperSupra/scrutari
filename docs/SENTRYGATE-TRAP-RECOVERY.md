# Public SentryGate test contract recovery

The scheduled public Weekly Baselines run 43883727513 (16 Nov 2026)
failed 24/88 honeypot assertions. All 24 failures were outdated test
expectations: `ACME Corp` instead of `SentryGate Inc.`, `hp_track`
instead of `sg_track`, and `__hp_visit` instead of `__sg_visit`.

The public site already uses SentryGate names. This PR updates only those
expectations, *not the honeypot responses or deployed site*.
Playwright's browser route now aborts any non-GET/HEAD requests; those
tests are not permitted to generate production beacons. Browser errors
cause a RED instead of being silently skipped.

These are **read-only live tests of an owned site**. Even 88/88 would
not establish deployed Git commit identity, Blob persistence,
legitimate-user/AT false positive rates, or research accuracy.
Do not treat a transient Netlify HTTP 502 as a pass-by-retry.

DLE authority: SemperSupra/scrutari-private issue #49.
