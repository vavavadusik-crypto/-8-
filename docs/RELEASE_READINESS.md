# Hermest Board — Release Readiness Ledger

Observed: 2026-07-13
Status vocabulary: VERIFIED / PARTIAL / MOCKED / MISSING / BLOCKED / TARGET

## Current stable evidence

| Capability | Status | Evidence / caveat |
|---|---|---|
| Interactive card board | VERIFIED | current frontend and browser smoke |
| Card image XSS/CSP remediation | VERIFIED LOCALLY, UNCOMMITTED | branch `fix/card-image-xss`; security tests included |
| Full current project gate | VERIFIED | `npm run check`: 46/46 unit, API smoke, Vite build, browser screenshot smoke on 2026-07-13 |
| Public research endpoint | VERIFIED in prior audit/current code | response-to-production-card workflow remains MISSING |
| BYOK AI proxy | PARTIAL | supported providers exist; structured pipeline and abuse controls incomplete |
| Script builder | MOCKED/PARTIAL | current function contains hardcoded Hermest-specific prose |
| Browser TTS | VERIFIED preview only | no exportable narration artifact |
| Browser WebM recording | VERIFIED recording only | not deterministic render pipeline |
| Publish pack | VERIFIED level 0 metadata | final render assets/subtitles not yet produced |
| Real narration artifact | MISSING | first R1 target |
| Real MP4 renderer | MISSING | FFmpeg 8.0.1 and ffprobe are available locally |
| Platform variants | MOCKED specs | no actual 16:9/9:16 render outputs |
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

- [ ] Pure storyboard tests observed RED then GREEN.
- [ ] Platform recipe tests.
- [ ] Narration audio file exists and ffprobe-valid.
- [ ] SRT exists and timeline-valid.
- [ ] 16:9 MP4 has video+audio.
- [ ] 9:16 MP4 has video+audio.
- [ ] Manifest contains hashes/probe metadata and no secrets.
- [ ] Existing `npm run check` stays green.
- [ ] Independent code/security review.
- [ ] Claude Code review after login.

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

Current alpha is not a complete content factory, private multi-user SaaS or autopublisher. R1 will prove real local media generation but will not by itself prove cloud durability or public connector readiness.
