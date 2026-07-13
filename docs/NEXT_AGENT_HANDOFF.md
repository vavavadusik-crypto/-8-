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

The current branch passed canonical `npm run check` after `f4a9bfb`: 102/102 unit tests, API smoke, four real render/repro runs, Vite build and browser smoke.

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
- secret-free configured/implemented/executable status and blocked social plans.

Not complete:

- semantic short editing;
- quality Russian/multilingual TTS adapter;
- durable cloud queue/object storage;
- generated-image/video provider adapters;
- immutable approval candidate binding;
- OAuth token exchange and real publishing;
- analytics feedback loop.

Autopublishing must remain disabled.

## Active next TDD slice: immutable publish candidate

Do not call social APIs and do not implement token exchange in this slice.

Required behavior:

1. Add a pure canonical candidate builder that binds:
   - project/workspace identity;
   - normalized board snapshot hash;
   - exact platform recipe/version;
   - allowlisted render artifact names, sizes and SHA-256 hashes;
   - render manifest hash;
   - rights summary and selected platforms.
2. Candidate IDs/digests must be deterministic for the same sealed input; timestamps and filesystem paths must not enter the digest.
3. Add a dedicated storage collection and workspace authorization for publish candidates.
4. Create/list/read candidate API routes; never return local paths, tokens, env values or arbitrary metadata.
5. Candidate becomes immutable once sealed. Any project/render/rights change creates a new candidate.
6. Bind approval to exact `candidateId`, `candidateDigest` and version. Reject stale/mismatched/unsealed/rights-unknown candidates before approval.
7. Approval remains non-executing: even an approved candidate must return `canAutopublish: false` with durable worker/OAuth/provider-review blockers.
8. Add audit records for candidate creation/sealing and approval decision without embedding the full board or secrets.
9. Keep current job APIs backward-compatible or migrate them with explicit fixture updates; do not silently accept an unbound approval.

Start RED in `test/unit/publish-candidate.test.mjs`. Include mutation-after-seal, hash/order determinism, path/secret stripping, cross-workspace denial and stale digest counterexamples. Extend API smoke only after the pure contract is GREEN.

Run:

```bash
node --test --test-reporter=spec test/unit/publish-candidate.test.mjs
npm run smoke:api
npm run check
```

## Review gates still pending

- Independent final re-review of manifest commit `11da264`.
- Independent security/lifecycle review of UI worker commit `38fb89e`.
- Independent connector capability review of `f4a9bfb` is currently running.
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
