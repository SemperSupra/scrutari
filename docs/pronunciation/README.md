# Scrutari pronunciation guide

**Status: proposal, not yet accepted for spoken media or public playback.** The suggested English brand pronunciation is **skroo-TAH-ree** (approximate US-English IPA **/skruːˈtɑː.riː/**), primary stress on **TAH**. Its Latin source, *scrūtārī* (“to search, examine”), is commonly reconstructed as **/skruːˈtaː.riː/**. The English brand reading is an editorial proposal; a listener/owner decision remains required.

- [Accessible text-only guide](index.html) presents basic respelling, IPA, stress, and a text fallback with no network calls.
- The **full-word audio recording, two voice variants, compact timed video, measured syllable intervals and media checksums are not yet produced or approved**. No dummy audio, browser speech synthesis, or invented timestamps are presented as accepted media.
- The consuming project retains the acceptance decision and provenance; reusable generation tooling belongs in `SemperSupra/dev-toolbox-private`, pinned at commit `8c6100c5c1dc40891541f1072a141b64ccb0ae9c`.
- The generalized recipe `docs/media/SYLLABLE-HIGHLIGHT-GUIDE.md` turns one accepted connected whole-word WAV per voice into a compact video: syllables highlighted during pass one, whole word during pass two, without cutting the speech into fragments.
- Publication is a separate gate: verify any synthetic voice model's rights and notices, obtain human listening approval, and publish only reviewed output media. Keep source WAVs and generation logs private until separately authorized.

**Proposed syllable labels (not aligned to audio):**

| Segment | Basic | Approximate English IPA |
|---|---|---|
| 1 | skroo | /skruː/ |
| 2 (stressed) | TAH | /tɑː/ |
| 3 | ree | /riː/ |

This text guide is self-contained. When accepted audio exists, add native accessible `audio`/`video` controls to `index.html`, commit the exact timed manifest and source/output digests, and verify media with an offline checksum/regression test. Do not include empty playback controls or substitute operating-system speech synthesis for the accepted recording.
