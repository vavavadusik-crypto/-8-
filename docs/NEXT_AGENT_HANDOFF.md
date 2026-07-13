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
- `a4a12b0` — manifest security fix carried into the UI/connector line.

The authoritative main checkout passed `npm run check` after `11da264`: 88/88 unit tests, API smoke, four real render/repro runs, Vite build and browser smoke.

The UI branch passed its full gate before the final manifest carry: 98/98 unit tests, API smoke, four real render/repro runs, build and browser smoke. After carrying the manifest fix, the combined targeted gate passed 14/14. Rerun the full combined `npm run check` before the next completion claim.

No push, deploy or public publication was performed.

## Current product truth

Implemented and real:

- deterministic board → storyboard/script;
- real WAV narration through a provider-neutral TTS port (Flite is only an English-quality offline smoke fallback);
- real H.264/AAC 16:9 and 9:16 MP4, SRT, storyboard, manifest and hashes;
- independent ffprobe QC and repeated-render reproducibility;
- loopback-only Board render UI/worker with queue, cancel and downloads.

Not complete:

- semantic short editing;
- quality Russian/multilingual TTS adapter;
- durable cloud queue/object storage;
- generated-image/video provider adapters;
- immutable approval candidate binding;
- OAuth token exchange and real publishing;
- analytics feedback loop.

Autopublishing must remain disabled.

## Active next TDD slice: connector capability router

Do not create a second provider catalog. `public/api-provider-catalog.json` is the descriptive provider source.

Add a provider-neutral capability layer for the Board Agent:

```text
research.search
media.search
image.generate
speech.synthesize
speech.transcribe
video.generate
storage.put
publish.draft
analytics.read
```

Required behavior:

1. Add `api/_lib/connector-capabilities.js` with immutable capability definitions and a planner.
2. Distinguish these states:
   - `working_adapter`;
   - `configured_adapter`;
   - `configured_but_adapter_missing`;
   - `oauth_skeleton`;
   - `approval_required`;
   - `blocked`.
3. Configuration/key presence is a boolean only and must never imply that an adapter is implemented.
4. Never return env values, tokens, credential URLs or browser BYOK values.
5. Existing no-key aggregate research may be executable now.
6. Local Flite may be executable only in the local media runtime, never claimed available on public Vercel.
7. Image/video/TTS provider slots such as fal/Replicate/ElevenLabs remain adapter targets until a real adapter and fixture exist.
8. YouTube/TikTok/Instagram routes remain non-executable and approval-gated until OAuth exchange, scopes, durable candidate and provider review exist.
9. Expose a safe read-only capability-status route in `api/product.js`.
10. Add connector route selection/blockers to `buildAgentPlan` without making network calls.

Start with RED tests in `test/unit/connector-capabilities.test.mjs`. Include tests that secret sentinel env values never appear in serialized output and that `FAL_KEY`/`ELEVENLABS_API_KEY` presence alone does not mark an unimplemented adapter executable.

Then run:

```bash
node --test --test-reporter=spec test/unit/connector-capabilities.test.mjs
npm run smoke:api
npm run check
```

## Review gates still pending

- Independent final re-review of manifest commit `11da264`.
- Independent security/lifecycle review of UI worker commit `38fb89e`.
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
