# Hermest Board — Release Readiness Ledger

Observed: 2026-07-13
Status vocabulary: VERIFIED / PARTIAL / MOCKED / MISSING / BLOCKED / TARGET

## Current stable evidence

| Capability | Status | Evidence / caveat |
|---|---|---|
| Interactive card board | VERIFIED | current frontend and browser smoke |
| Card image XSS/CSP remediation | VERIFIED LOCALLY, CHECKPOINT PENDING | branch `fix/card-image-xss`; security tests included |
| Full current project gate | VERIFIED LOCALLY, RE-REVIEW PENDING | `npm run check`: 98/98 unit, API smoke, four real render/repro runs with independent `/usr/bin/ffprobe`, Vite build and browser screenshot smoke on 2026-07-13 |
| Public research endpoint | VERIFIED in prior audit/current code | response-to-production-card workflow remains MISSING |
| BYOK AI proxy | PARTIAL | supported providers exist; structured pipeline and abuse controls incomplete |
| Pure board→storyboard/script core | VERIFIED R1 | deterministic spatial order, lineage, resource/schema limits; frontend adoption remains pending |
| Browser TTS | VERIFIED preview only | not used as exported artifact |
| Offline narration adapter | VERIFIED R1 SMOKE | real WAV + metadata/hash/cancellation; Flite voice is English-only quality fallback |
| Browser WebM recording | VERIFIED legacy recording only | explicitly not the deterministic renderer |
| Publish pack | VERIFIED level 0 metadata | local R1 render artifacts are downloadable in Board UI but are not yet bound to immutable publish candidates |
| Real MP4 renderer | VERIFIED R1 | FFmpeg H.264/AAC, strict ffprobe, atomic artifacts, private run directory |
| Local Board render worker | VERIFIED R2 LOCAL | loopback-only Vite worker, bounded queue, cancellation, allowlisted downloads and lifecycle cleanup; real HTTP→FFmpeg→download smoke passed |
| Platform variants | PARTIAL/VERIFIED R1 | real 16:9 and 9:16 files; vertical is honestly `aspect_only_r1`, semantic edit pending |
| Render manifest | VERIFIED R1 | deterministic recipe/tool/QC/lineage manifest, hashes and SHA-256 sidecar |
| Durable worker/queue | MISSING | jobs/approval records only |
| OAuth token exchange/publish | BLOCKED/MISSING | skeleton only; platform review required |
| Analytics feedback loop | MISSING | target R7 |

## Environment facts

- Node `v22.22.1`, npm `9.2.0`.
- FFmpeg/ffprobe `8.0.1` available.
- FFmpeg has `flite` filter: usable as deterministic no-key audio smoke fallback, not release-quality Russian voice.
- Claude Code `2.1.203` installed but not logged in; mandatory Claude gate pending operator login.
- Local OmniCoder excluded.

## Release gates

### R1 local media tracer

- [x] Pure storyboard tests observed RED then GREEN.
- [x] Versioned platform recipe tests.
- [x] Narration audio file exists and is independently ffprobe-valid.
- [x] SRT exists and its end time fits the rendered timeline.
- [x] 16:9 MP4 has H.264 video + AAC audio.
- [x] 9:16 MP4 has H.264 video + AAC audio.
- [x] Deterministic manifest contains allowlisted tools, redacted argv, QC, lineage, hashes and no secret-shaped metadata.
- [x] Input/resource/run/process boundary tests and cleanup checks.
- [x] Repeated real render produces the same manifest/artifact hashes.
- [x] Existing `npm run check` stays green and now includes `test:media`.
- [x] Follow-up independent review of snapshot `32f8813` completed with BLOCK and four exact counterexamples.
- [x] All four review counterexamples now have local regression coverage and pass the full gate.
- [ ] Independent read-only re-review of the post-BLOCK fix commit.
- [ ] Claude Code Opus review after CLI login; current auth blocker is documented.

### R2 local Board worker

- [x] Board UI can submit the exact current project snapshot to a same-origin local worker.
- [x] Worker is bound to loopback and rejects foreign origins/mutations without the custom header.
- [x] Queue is bounded, runs one media job at a time and supports cancellation.
- [x] Public job state contains no filesystem paths; artifact downloads are allowlisted.
- [x] Structurally unsafe/oversized projects fail before queueing or rendering.
- [x] Completed private outputs are removed when their job is evicted.
- [x] Real HTTP → queue → FFmpeg/TTS → MP4 download smoke independently ffprobe-verified.
- [ ] Durable cloud queue/object storage; local worker is intentionally not the public Vercel worker.
- [ ] Immutable candidate binding and approval transition.

### Public beta

- [ ] Real identity/tenant authorization.
- [ ] Durable DB/object storage/queue.
- [ ] Restore drill.
- [ ] High-quality multilingual TTS/media adapters.
- [ ] Browser E2E and failure injection.
- [ ] Rate limits/abuse/privacy/retention.

### Public publishing

- [ ] OAuth lifecycle and token scope verified.
- [ ] Platform review/readiness recorded.
- [ ] Immutable candidate approval.
- [ ] Idempotency/reconciliation/kill switch.
- [ ] Explicit owner release approval.

## Non-claims

Current alpha is not a complete content factory, private multi-user SaaS or autopublisher. R1 proves real local media generation and R2 proves a loopback Board-to-worker flow; neither proves cloud durability, semantic short editing or public connector readiness.
