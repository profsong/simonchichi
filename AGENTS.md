# AGENTS.md — English Quest engineering guidance

This file defines persistent repository instructions for Codex.

## Mission

Build a **local-first, mobile-first PWA for one Korean middle-school (Grade 8) advanced English learner**. Read `docs/PRODUCT_SPEC.md` before implementing. Its Korean descriptions and the latest explicit user requests are authoritative. The current course lesson contains five memory steps, 20 vocabulary meaning-choice questions, two syntax questions, two reading passages/questions, then one delayed retest for initially wrong vocabulary; do not promise completion in 12 minutes. Ask for clarification only if absolutely blocked; otherwise record reasonable assumptions and implement in small increments.

## Current user-authorized product policy — 2026-11-01

- The user explicitly accepted the loaded wordbooks for normal use. Show current bundled lessons immediately, without content-readiness screens, approval-mode controls, or a manual reading-band selector. This overrides the former approved-only runtime gate; it does not justify relabeling source `draft` records as independently reviewed or teacher-approved.
- Present two wordbooks: `advanced-300` (the existing 300 words combined, 15 lessons) and `suneung-2000` (all 2,000 source rows, 100 lessons). Select the active wordbook at the top of Today and in Settings, and persist selection.
- New lessons have 29 base steps: five memory steps (up to five learned-word questions, filling any shortage with preview cards), 20 vocabulary meaning-choice questions without preceding study cards, two syntax questions, and two reading passages/questions. Append 0–20 initially wrong vocabulary questions once after reading, for 29–49 total steps. Preserve legacy 49-step sessions as stored. Do not silently reduce lessons to fit the old daily time budget.
- The 176 words shared by the books remain included in the 2,000-word course so every source row is covered. Reuse canonical vocabulary/SRS identity, while keeping course progress separate.
- The review tab contains the wordbook-library entry and a 10-word review test: five multiple-choice questions and five English typed answers with the first letter shown. Draw only from learned words and give previously incorrect words greater sampling weight. First-letter-assisted recall is not unassisted mastery evidence.
- Preserve all old attempts, rewards, sessions, vocabulary IDs, and legacy backup compatibility. New lesson IDs are separate from the old 60 plans; never claim old plan completion automatically completes new 20-word lessons. Legacy learner/demo database identity is a compatibility detail, not a visible content restriction. Validate legacy backups in their original mode before explicitly rescoping internal appMode metadata into the current database; preserve all learning records and never forge a fixture mode.

## Avatar room and XP currency — 0.6.0 user request

- In Reviews, place a square avatar room first, the 10-word review test second, and the library link last. The room uses the selected companion and purchased background/outfit/accessory.
- XP may be spent on cosmetic items. Keep cumulative earned rewards immutable and compute available XP as earned minus purchase receipts. Purchases, ownership, and equipment changes are atomic; a repeat tap never charges twice. Owned items can be equipped again for free.
- Use `src/core/room-catalog.ts` as the authoritative item/category/price catalog. No money, payment flow, ads, or random loot boxes are introduced.
- A new review test pays only when completed: `floor(maxXp * firstCorrect / 10)`, where `maxXp = floor(todayCoursePotentialXp * 0.30)`. Freeze the selected course/basis in the session. A legitimate new round may earn again on the same day; duplicate submission/completion of the same round cannot.
- Old review sessions without the new reward policy keep their original accounting. Export backup schema 6; accept schemas 1–6 and preserve old records while adding absent purchases as an empty list.

## Background previews — 0.7.0 user request

- Render unowned backgrounds as name, description, price, and purchase button only. Do not mount image, SVG, scene, preview, or image placeholder DOM for an unowned background; hiding or blurring an existing image is insufficient.
- A committed purchase reveals the preview. All owned backgrounds retain previews even when not equipped; the free default is visible from the start. Outfit and accessory previews are unchanged.
- The 0.7.0 release introduced 14 backgrounds and 22 total items; the current total follows the later expansion policies below. Add future backgrounds with a stable unique ID, Korean description, price, and distinct local scene. Keep item IDs stable. Price changes require an explicit versioned policy that preserves historical receipt charges; the 0.9.0 policy below supersedes original shop prices.
- Keep Dexie 3 and the review reward policy; backup schema follows the current flow policy below. Deliver new scenes through a rebuilt app update, preserving existing records and purchases.

## Test-first vocabulary and delayed retest — 0.8.0 user request

- New course sessions use `courseFlow: "test-first-v1"`. Vocabulary presents an English word and four Korean meanings directly; remove the 20 preceding vocabulary study cards. Memory preview cards still fill missing learned words in the first five steps.
- At the final reading advance, freeze `retestQuestionIds` once (including an empty list). Only first-wrong questions from the initial vocabulary phase qualify, in their original order. Memory, syntax, reading errors and retest errors never create another tail.
- Tail steps use `phase: "retest"`, `id: originalId + ":retest"`, and `retestOf: originalId`. Answers and reward accounting retain the original question ID with `firstTry: false`. Rotate displayed choices and grade against the actual tail step.
- Do not show an immediate retry button for new course attempts or permit repeated tail retries. The existing retry +3 XP key is the only possible tail reward; no new +10 or separate retest completion bonus. Award the daily completion bonus only after the tail is finished, and exclude tail questions from standalone review reward potential.
- Count the 20 distinct initial vocabulary question entities for the completion display. Keep old 49-step sessions without flow metadata unchanged and resumable. Export schema 6; import valid schemas 1–6 while rejecting new flow metadata disguised as old schemas.

## Cosmetic price balance — 0.9.0 user request

- The 0.9.0 base prices are backgrounds 12,000 XP, standard outfits 6,000 XP, and accessories 2,500 XP. The 0.11.0 policy below adds three new premium outfits at 7,000 XP without repricing existing items. The three free defaults remain free. `room-catalog.ts` is authoritative.
- The estimate assumes three to four new lessons per day: 24 new questions × 10 XP per first-correct answer, plus one 30 XP daily completion bonus, giving 750–990 XP/day (midpoint 870). Prices approximate 14/7/3 days, not a guaranteed earning schedule or a waiting lock. Exclude repeated memory rewards and separate unlimited review tests from this estimate.
- New purchase receipts carry `pricingVersion: 2`. Historical receipts without this field retain their original v1 charge, ownership, and timestamps. Never reprice old spending, deduct a difference, alter cumulative earned XP, or change reward formulas for this price update.
- Export schema 6 and accept valid schemas 1–6. Reject new versioned receipts disguised as schemas 1–5 and validate both price generations in mixed backups. Dexie remains version 3.

## Accessory expansion — 0.10.0 user request

- Add ten stable accessory IDs: `mint-ribbon`, `star-hairpin`, `moon-hairpin`, `butterfly-clip`, `daisy-pin`, `pearl-headband`, `heart-sunglasses`, `mint-scarf`, `lucky-clover`, `blue-beret`. The 0.10.0 release contained 14 accessories including free `none`, 14 backgrounds, and four outfits: 32 items, three free and 29 paid. The later outfit expansion updates the current total.
- All paid accessories cost 2,500 XP under pricing version 2. Do not change historical receipts, other category prices, XP rewards, Dexie 3, or backup schema 6. New IDs have no invented version-1 purchase price.
- Use distinct local SVG accessories on all three companions, including the cropped profile/preview view. Accessory previews remain visible before purchase; the background-only ownership gate does not apply to them. Equipment remains a single accessory slot, and owned items re-equip free.
- Preserve all existing item IDs, ownership, settings and learning records across the rebuilt app update. Verify new purchase idempotence, all three companions, backup restoration and offline reuse without claiming physical-phone testing from browser/emulator results.

## Outfit expansion — 0.11.0 user request

- Add ten stable outfit IDs. New premium outfits `nike-hoodie`, `adidas-puffer`, and `burberry-coat` cost 7,000 XP each. New standard outfits `mint-cardigan`, `denim-jacket`, `striped-knit`, `lavender-sweater`, `raincoat`, `cozy-fleece`, and `ribbon-dress` cost 6,000 XP each.
- Keep the original four outfits and all existing item IDs, prices, appearance, receipts and equipment unchanged. Current totals are 14 backgrounds, 14 outfits and 14 accessories: 42 items, three free and 39 paid. The three premium prices are explicit new-item exceptions to the base outfit category price.
- The separately reviewed round-glasses highlight correction (absolute `M` and explicit relative `l`) is allowed to fix an existing out-of-bounds reflection; preserve its item ID, price, receipt and ownership. Distinguish this intentional art correction from unchanged legacy outfit rendering.
- Apply distinct local SVG outfits to all three companions and show outfit previews before purchase. Keep one outfit slot and free re-equipping of owned items. Preserve compatibility with accessories and existing profile rendering.
- Pricing version 2, backup schema 6, Dexie 3 and XP reward formulas stay unchanged. New IDs have no version-1 price; validate each new outfit's actual catalog price rather than assuming all outfits cost 6,000 XP. Test standard/premium price tampering, duplicate purchases, backup restoration and offline persistence.

## GitHub Pages deployment preparation — 2026-11-01

- Keep web deployment compatible with both account-site `/` and project-site `/repository/` paths. Use `VITE_BASE_PATH` from the official configure-pages `base_path` output for web builds, and keep Android bundled assets at `/`.
- Keep manifest start/scope/icons, service-worker registration/scope and local attribution links under the same base path. Do not require a server rewrite for in-app navigation.
- Publish only the validated web `dist/` artifact through the Pages workflow. Do not upload source PDFs, learning backups, APKs, test snapshots, local environment secrets, or Android signing material. Preserve the checked-in synthetic test fixtures needed by CI and their provenance documentation.
- Repository visibility and Pages-site visibility are separate. Treat an ordinary Pages deployment as publicly accessible and keep the bundled content/asset licensing decision explicit. Learner records remain local; hosting does not introduce cloud sync. New origins require an explicit backup restore to move existing records.
- Limit CI build permissions to reads and grant Pages/OIDC writes only to the dependent deploy job. Do not create repositories, change visibility, push, or run a public deployment without a concrete authorized target. Report local checks separately from actual Actions deployment and physical iPhone verification.

## Non-negotiable product constraints

1. Target iPhone Safari and Add to Home Screen; do not build a native iOS app in MVP.
2. Start with **zero network AI dependency**, no login, no analytics, no payments, no ads.
3. Use original or explicitly licensed items only. Enable the user-accepted bundled wordbooks in normal use under the current policy above. Preserve honest source review metadata; do not claim independent educational approval. The original expanded bank and its IDs remain intact.
4. All study data is stored locally via IndexedDB (Dexie); implement import/export backup with schema version validation.
5. Reading explanations must identify actual evidence in the passage; never have AI invent a grading answer.
6. No minor's personal identifiers. No third-party trackers. Never embed API keys, local Ollama endpoints, or secrets in frontend bundles.
7. A quiz may award XP only once per question attempt event. Never let fast tapping/refresh generate extra rewards.
8. Separate recognition accuracy from active recall and contextual understanding when tracking mastery.
9. Accessibility: visible focus, keyboard operation, VoiceOver-friendly labels, minimum 44 CSS px touch targets where feasible, reduced motion.
10. Never claim language proficiency certifications or CSAT score predictions based on app practice.

## Approved technology for MVP

- Vite + React + TypeScript (strict)
- Tailwind CSS with CSS custom-property design tokens
- IndexedDB / Dexie
- Zod content validation
- vite-plugin-pwa, web app manifest, service worker / Workbox
- Vitest, React Testing Library, Playwright E2E
- ESLint and formatting

Prefer stable library versions at implementation time; do not pin obsolete versions without verification. Keep implementation modular and simple. Avoid Redux, large servers, OR solvers, multi-agent orchestration, and premature cloud synchronization.

## Expanded curriculum and content (added 2026-10-23)

- Canonical complete JSON: `src/data/seed-content.json` (`schemaVersion: 1`, `contentVersion: 1.0.0-12week-draft`). Its original 60-word demo is preserved separately at `src/data/seed-content.demo-original.json`.
- Keys: `vocabulary` (300), `vocabularyQuestions` (600), `syntax` (60), `readings` (60, each 2 questions), `diagnostic` (30 questions + four separate passages), `weekPlans` (12), `dailyPlans` (60), `bossQuests` (12).
- Exact item IDs from the original seed remain stable. Never silently renumber or replace them; progress is keyed by item ID.
- `content_src/*.psv` are editable educational source records. Build with `python3 tools/build_content_bank.py`, verify with `python3 tools/validate_content_bank.py`. The builder is deterministic and does not approve any content.
- The original `dailyPlans` are legacy five-word plans kept for history/backup compatibility. Current courses use the separate 20-word lessons specified above.
- `bossQuests` review previously scheduled weekly questions. They do not represent new unique content or justify repeated first-attempt XP.
- `B1/B2/B3` are local curriculum bands, not official CEFR levels.
- Reading question status inherits its parent passage until a proper per-question review state is implemented.

## Directory layout

- `src/app` app shell/navigation
- `src/components` accessible primitives
- `src/features` diagnostic, daily quest, vocab, syntax, reading, review, progress, settings
- `src/core` pure logic (grading, SRS, quest assembly, XP)
- `src/data` schemas, IndexedDB, content catalogs
- `scripts/validate-content.ts` data QA
- `tests/unit`, `tests/e2e`
- `docs/PRODUCT_SPEC.md` canonical requirements

## Development workflow

1. Before coding, read the product spec, inspect the repo, summarize the next self-contained milestone.
2. Start with working responsive navigation and one full quest flow.
3. Keep SRS scheduling, grading, and reward accounting as pure testable functions.
4. Commit or present a cohesive diff after each phase, list changed files and test results.
5. Run `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` after meaningful changes. If a command is not yet wired, implement it.
6. Run Playwright E2E; report whether actual iPhone verification was performed. Playwright WebKit alone is not proof of iOS PWA compatibility.
7. Document all deviations from spec in `docs/DECISIONS.md`, including rationale.

## Content protection and validation

- `reviewStatus` is a controlled enum: `draft | validated | approved`. Keep it truthful; current loaded-course runtime eligibility follows the user's explicit acceptance rather than the former approved-only filter.
- Validate semantic correctness beyond JSON structure manually. Duplicate Korean meanings across options must be reviewed.
- Reject questions with no correct choice, multiple correct choices, empty explanation, or quote absent from passage.
- Do not scrape EBSi, textbooks, paid apps, or mock exams.
- Student-facing errors should be brief, reassuring, and should not expose internal stack traces.

## Unit tests that must exist

- Due schedule with local-day boundary, success/failure/hint effects, 7-day mastery requirements.
- Wrong answer does not grant mastery; recognition-only progress does not count as active recall.
- Current lessons cover all 300/2,000 scheduled words in 15/100 complete lessons, with two syntax and two reading tasks per lesson; review selection uses learned words and increases wrong-word sampling weight.
- One and only one answer is correct; distractors are distinct.
- Duplicate submission/refresh never creates duplicate XP.
- Completed lessons survive page reload.
- Backup/export -> reset -> import reconstructs attempts and review state.
- Offline app-shell/loaded question bank works (Playwright + real-device manual check).

## UI standard

- Korean first; English example phrases and words stay in English.
- Clean, playful yet not babyish for an advanced middle-school learner.
- Course flow: five memory steps, 20 vocabulary meaning-choice questions, two syntax questions, two reading passages/questions, then one retest for initially wrong vocabulary. A separate review test contains five recognition and five first-letter-assisted recall questions. No fixed 12-minute completion promise.
- One prominent CTA per screen. No aggressive infinite scroll, dark patterns, punitive streaks.
- Student may skip a day without penalty; no timed quizzes by default.
- Use simple, accessible inline SVG/CSS for icons and visuals; avoid loading unauthorized images.

## Final reporting per implementation phase

- Delivered features
- Commands run and pass/fail summary
- Open issues/assumptions
- Exactly how to run and test on an iPhone
- Next scoped phase
