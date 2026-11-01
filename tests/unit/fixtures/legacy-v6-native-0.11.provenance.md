`legacy-v6-native-0.11.json` preserves the six IndexedDB tables read from the actual
Android emulator running version 0.11.0, after the in-place 0.10 → 0.11 verification.
It is a schema-6 envelope around that read-only snapshot, **not** a claim that the
Android document picker exported this file.

- Source snapshot: `artifacts/android/outfits-2026-11-01T13-15-59-649Z/final-six-tables.json`
- Snapshot SHA-256: `be9a4268668ecbe7ef37ca88d7c5c9a445d440563d9e5ddbe45c612223f1bcc3`
- Installed APK SHA-256: `eac298e44c1b60897cd7e4c0c2fd65a3bd73548b8346c899322e5a7fa77c1f5b`
- Report: `artifacts/android/native-outfits-results.json`
- Envelope export time: the report's completion time, `2026-11-01T13:26:35.401Z`.
- Original mode: `demo`, unchanged. Original content version: `1.0.0-12week-draft`.
- Original records: 7 sessions, 101 attempts, 62 reviews, 83 rewards, 4 purchases, 1 settings row.
- Original economy: 998 earned XP − 580 actual historical spending = 418 available XP.

No answer, reward, timestamp, receipt, identifier, equipment setting, or appMode
inside the six source tables was edited. The tests use a separate fake IndexedDB
database and do not access or reset a user's browser or emulator storage.
