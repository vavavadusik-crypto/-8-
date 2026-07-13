# Hermest Board — next agent handoff

Updated: 2026-07-13
Owner/orchestrator: Sol/Hermes
Coding fallback: Kimi K2.7 Code through Ollama Cloud + OpenCode

## Read first

1. `AGENTS.md`
2. `docs/PRODUCT_NORTH_STAR.md`
3. `docs/DELIVERY_MASTER_PLAN.md`
4. `docs/RELEASE_READINESS.md`
5. `docs/AGENT_ORCHESTRATION.md`
6. `docs/KIMI_OLLAMA_HANDOFF.md`

Do not use local OmniCoder. Do not push, deploy, publish, access secrets or alter external accounts.

## Verified checkpoints

- `da8d267` — card-image XSS/CSP hardening.
- `32f8813` — real local TTS/FFmpeg media tracer.
- `bef0a66` + `9b96b1c` — structural preflight, independent ffprobe, physical `/tmp` boundary and portable regression.
- `11da264` — exact per-command manifest argv schemas; reviewer credential carriers fail closed.
- `38fb89e` — Board UI → loopback Vite worker → bounded queue/cancel → allowlisted artifact downloads.
- `fa5b71d` — merged permanent checkpoint with R1 security, R2 UI worker and Kimi/OpenCode handoff.
- `f4a9bfb` — shared connector capability router, secret-free status route and capability-routed agent plan.
- `85709d9` — deterministic sealed publish candidates, workspace-isolated metadata API and exact stale-safe approval binding.

The current branch passed canonical `npm run check` after `85709d9`: 107/107 unit tests, API smoke, four real render/repro runs, Vite build and browser smoke.

No push, deploy or public publication was performed.

## Current product truth

Implemented and real:

- deterministic board → storyboard/script;
- real WAV narration through a provider-neutral TTS port (Flite is only an English-quality offline smoke fallback);
- real H.264/AAC 16:9 and 9:16 MP4, SRT, storyboard, manifest and hashes;
- independent ffprobe QC and repeated-render reproducibility;
- loopback-only Board render UI/worker with queue, cancel and downloads;
- one 44-provider catalog plus Board-owned capability routing;
- implemented no-key research/Commons routes and local-only Flite selection;
- secret-free configured/implemented/executable status and blocked social plans;
- deterministic immutable publish candidates with exact ID/digest/version approval binding;
- approved jobs remain execution-blocked and cannot be relabelled `running` through PATCH.

Not complete:

- semantic short editing;
- quality Russian/multilingual TTS adapter;
- durable cloud queue/object storage;
- generated-image/video provider adapters;
- trusted persistence of real local worker evidence into product publish candidates;
- OAuth token exchange and real publishing;
- analytics feedback loop.

Autopublishing must remain disabled.

## Active next TDD slice: trusted local worker candidate evidence

Do not call social APIs and do not implement token exchange in this slice.

Required behavior:

1. Add a server-side integration port from the completed loopback render job into the existing `buildPublishCandidate` contract.
2. Evidence can become `server_verified` only after the current worker's independent ffprobe/manifest/hash checks have completed successfully.
3. Artifact names, byte counts and SHA-256 values must be derived from the worker's actual manifest/result, never copied from request metadata.
4. Require a persisted product project with matching workspace/owner and matching normalized board snapshot before saving the candidate.
5. Derive rights only from persisted project assets through `summarizeAssetRights`; never accept rights status from the browser or worker request.
6. Fail closed on project snapshot mismatch, missing artifact, hash mismatch, unknown/restricted rights or missing storage authorization.
7. Persist through a narrow server-only callback/port; do not expose an HTTP flag that lets a client claim `server_verified`.
8. Return only candidate ID/digest/version/blockers in local job state. Never expose filesystem paths or full board content.
9. Keep candidates immutable and idempotent. If a deterministic ID already exists with a different digest/state, reject it.
10. Autopublishing remains disabled even when evidence and rights are valid.

Start RED by extending the local job-manager/integration tests with real manifest-shaped evidence, request-spoofing counterexamples, rights-unknown failure and snapshot mismatch. Extend the real HTTP smoke only after the pure port is GREEN.

Run:

```bash
node --test --test-reporter=spec test/unit/publish-candidate.test.mjs test/unit/local-media-job-manager.test.mjs
npm run smoke:api
npm run check
```

## Review gates still pending

- Independent final re-review of manifest commit `11da264`.
- Independent security/lifecycle review of UI worker commit `38fb89e`.
- Independent connector capability review of `f4a9bfb` is currently running or awaiting verdict.
- Independent immutable candidate review of `85709d9` is currently running.
- Mandatory Claude Code Opus review: Claude CLI is installed but not logged in; run `claude auth login` when available.
- Kimi Cloud smoke: Ollama is installed/running, but owner browser sign-in is still required via `ollama signin`.

A killed, timed-out or verdict-less review is `INCOMPLETE`, never PASS.

## Recovery

```bash
cd /home/architect/ai-dev-station/workspace/hermest-board
git status --short --branch
git log -8 --oneline --decorate
npm run check
```

If an interrupted write exists, inspect every touched file before any further edit. Preserve a verified local commit before switching agents or branches.
