# Hermest Board — Delivery Master Plan

Дата: 2026-07-13
Статус: CURRENT EXECUTION PLAN
North Star: `docs/PRODUCT_NORTH_STAR.md`

## 1. Rescue-release strategy

The missed date is not recovered by claiming the alpha is 1.0. Recovery means producing the smallest honest end-to-end media release first, while preserving security guards and a path to standalone SaaS.

### Release R0 — stabilize current branch

- Finish and independently review `card.image` XSS/CSP modularization.
- Commit as an isolated checkpoint.
- Keep `npm run check` green.
- Freeze canonical docs and product vocabulary.

Gate: safe import/render regression, CSP without inline script, full current gate.

### Release R1 — real local media tracer (highest priority)

- Extract pure board→script/storyboard behavior.
- Add versioned recipes for 16:9 and 9:16.
- Add real narration file adapter.
- Add SRT generation.
- Render real MP4 via FFmpeg.
- Write manifest/hashes and validate through ffprobe.

Gate: one fixture produces audio+video MP4 in both aspect ratios and reproducible manifest. No screen capture.

### Release R2 — Board UI integration

- Add `Generate project`/`Render video` workflow without removing manual editing.
- Show stage progress/blockers/artifacts.
- Download manifest, SRT, master and vertical variants.
- Keep rendering local/worker-bound; Vercel does not process media bytes.

Gate: browser E2E from loaded board to submitted local/mock worker job and visible artifacts.

### Release R3 — research-to-cards automation

- Add production brief and AI Director questions/defaults.
- Convert existing public research response into source cards with citations.
- Add fact/claim/source lineage and contradiction warnings.
- Generate outline/script/storyboard through provider-neutral structured contracts.
- Preserve manual override at every stage.

Gate: topic produces cited editable cards and storyboard; unsupported claims are visible.

### Release R4 — release-quality media

- Add validated image/media acquisition and generation adapters.
- Add high-quality Russian/multilingual TTS adapter plus offline fallback.
- Measure narration and reconcile timeline.
- Add subtitle timing, audio normalization, covers and semantic short editions.
- Rights/provenance gate before candidate readiness.

Gate: representative Russian project renders reviewable master + shorts with provenance and QC report.

### Release R5 — durable standalone Board

- Decide identity/DB/object-storage/queue providers through ADR and spike.
- Migrate project metadata to typed PostgreSQL path.
- Add private direct object storage upload/finalize.
- Add durable outbox/queue/worker leases/retry/cancel/DLQ.
- Add tenant isolation, rate limits, restore drill and observability.

Gate: jobs survive restart/duplicate delivery; cross-workspace negative tests and restore drill pass.

### Release R6 — approval and official connectors

- Immutable publish candidate and exact approval.
- OAuth exchange/refresh/revoke/disconnect, one-time state and scoped token use.
- Level 0 pack always; level 1 inbox/private first.
- Public/scheduled levels only after platform review and owner release gate.
- Reconciliation prevents blind duplicate posts.

Gate: no external side effect without exact current approval; unsupported platform modes remain unavailable.

### Release R7 — analytics loop and 1.0

- Ingest allowed publication/status metrics.
- Convert retention/performance insights into metric/follow-up cards.
- Privacy/terms/retention/support/billing decisions.
- Complete browser/security/load/chaos/rollback gates.

## 2. TDD task order for R1

1. Add failing unit test for deterministic card ordering and scene creation.
2. Implement minimal pure `buildStoryboard`.
3. Add failing recipe tests for 1920×1080 and 1080×1920.
4. Implement recipe data/validation.
5. Add failing subtitle cue/SRT tests.
6. Implement deterministic subtitles.
7. Add failing manifest tests for lineage/hash/probe metadata.
8. Implement manifest builder.
9. Add failing integration test invoking render CLI on tempfile fixture.
10. Implement safe FFmpeg argv builder and offline narration adapter.
11. Observe RED because outputs are absent.
12. Render minimal title-card video with real audio.
13. Verify GREEN with ffprobe.
14. Add second vertical recipe.
15. Run `npm run check` plus media integration.
16. Independent spec/code/security review.
17. Checkpoint commit; no push/deploy.

## 3. Definition of Done by claim

| Claim | Required proof |
|---|---|
| Research works | source cards with canonical links, errors and timestamps |
| AI script works | structured provider output validated; no hardcoded product-specific prose |
| Voice works | downloadable non-empty audio artifact with measured duration |
| Video works | MP4 with video+audio streams, expected dimensions/duration |
| Shorts work | semantic variant recipe/output, not fixed byte/time chopping only |
| Worker works | durable/isolated execution state and artifact evidence |
| Approval works | exact immutable candidate binding and invalidation test |
| Publishing works | official provider ID/URL/status and reconciliation evidence |
| Release ready | stable final snapshot passes all gates and blocking reviews |

## 4. Required documents/ADRs

Current authority set is North Star, this plan, pipeline, rendering, orchestration and readiness ledger. Additional documents are created only when a decision is made:

- ADR identity/storage/queue/object storage;
- provider/model routing matrix with observation date;
- platform policy/readiness ledger;
- operations/runbook and incident response;
- migration/rollback record.

Do not create more broad roadmaps that compete with this plan.

## 5. Blockers requiring owner/external action

- Claude Code login is required for mandatory Claude review.
- Public connectors require developer apps, OAuth scopes and platform review.
- Paid/managed provider selection requires owner approval after measured spike.
- Push, Vercel deploy and real social publication require explicit owner approval.

These blockers do not prevent R1 local real-video implementation.
