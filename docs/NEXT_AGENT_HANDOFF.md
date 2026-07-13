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

## Current verified checkpoint: trusted local candidate evidence + media hardening

Current branch: `feat/board-connector-router`.

Code checkpoints:

- `6e20fe9` — persisted trusted local render candidates, UI/API wiring, disk byte/SHA re-verification, QC fail-closed behavior, Unicode/Windows path redaction and storage-ID alignment.
- `a4e6b33` — reject sensitive media command evidence before exact argv-schema parsing; restore exact repository `tmp` regression coverage.

Immutable review target:

- path: `/run/media/architect/KINGSTON/offload/agent-worktrees/hermest-board-review-a4e6b33`
- commit: `a4e6b33e1876235f9e16d5a8b90c6109d1371df5`
- tree: `8d12defb899d448b1176285d7bff8815ffc78a86`

Canonical combined gate on this code state:

```text
npm run check
119/119 unit tests PASS
smoke:api PASS
2/2 real FFmpeg media integration renders PASS
Vite production build PASS
browser screenshot smoke PASS
```

No push, deploy, social API call, OAuth exchange or external publication was performed.

## Trusted-worker contract now implemented

1. The loopback Vite worker invokes candidate persistence only through a narrow server-only callback.
2. A persisted product project is required and its normalized snapshot must match the rendered board.
3. Workspace/owner metadata and rights come only from persisted storage records; request-supplied rights/evidence/artifacts are ignored.
4. Recipe/platform/version, manifest and video names/types/hashes are bound into the immutable candidate.
5. Candidate persistence independently re-stats and re-hashes actual regular artifact files before calling the storage port.
6. A render with explicit failed QC never becomes completed or downloadable.
7. Persistence failure leaves completed media blocked instead of fabricating approval.
8. Deterministic existing candidates are idempotent; conflicting state fails closed.
9. Public job state exposes only candidate ID/digest/version/status/blockers, never paths or full board content.
10. Autopublishing remains disabled.

## Kimi blocking review and closure status

Ollama Cloud → OpenCode → Kimi K2.7 Code reviewed older frozen snapshot `3bd6a67` and returned `KIMI_TRUSTED_CANDIDATE_VERDICT=BLOCK`.

Reproduced and fixed through RED→GREEN:

- explicit `qc.passed=false` becoming completed/downloadable;
- missing independent disk bytes/SHA verification before candidate persistence;
- Unicode POSIX and Windows absolute path leakage in public job errors;
- two-character project IDs drifting from the storage contract.

Findings not accepted as current P0 after call-site/threat-model verification:

- local actor authorization: this implementation is explicitly single-user/loopback and is not the public multi-user worker; real identity/tenant authorization remains a documented public-beta blocker;
- arbitrary HTTP `server_verified`: public product API hardcodes `metadata_only`; the only current production `server_verified` caller is the narrow local persister;
- `pg` missing: `pg` is present in both `package.json` and `package-lock.json`; the detached snapshot simply had no installed `node_modules`;
- ownership/not-found error conflation: current code already emits distinct errors.

These classifications still require independent targeted re-review of `a4e6b33`; do not treat the older Kimi verdict as closed by self-assertion.

## Manifest security closure

Sensitive argv are now rejected before command-schema parsing, including:

- attached/separate header aliases (`-H`, `-headers`, `--header`, `--headers`);
- Authorization, Proxy-Authorization, Cookie and Set-Cookie carriers;
- leading whitespace and CRLF multi-header values;
- username-only and username/password URL userinfo;
- credential URLs embedded in assignment arguments;
- mixed-case schemes and percent-encoded authority delimiters;
- token/secret/password/credential assignments.

The exact repository `tmp` output-root counterexample is again covered in `test/unit/render-preflight.test.mjs`.

## Blocking review gates still pending

- Kimi targeted re-review against exact `a4e6b33`.
- Hermes trusted-candidate/UI-API/manifest reviews against the exact immutable target; any interrupted result is `INCOMPLETE`.
- Cerebras UI/API verdict if it returns against the older snapshot must be reproduced and then refreshed against `a4e6b33` when relevant.
- Mandatory Claude Code/Claude Desktop architecture-code-security review. CLI `2.1.203` is installed but not logged in; run `claude auth login` for unattended CLI use.

Do not call this release-ready until every blocking finding is closed on the current SHA and the full gate is rerun if any code changes.

## Recovery and next command

```bash
cd /home/architect/ai-dev-station/workspace/hermest-board
git status --short --branch
git log -6 --oneline --decorate
git diff --check
npm run check
```

For read-only review, use only:

```bash
cd /run/media/architect/KINGSTON/offload/agent-worktrees/hermest-board-review-a4e6b33
git rev-parse HEAD
git status --short --branch
```

Expected review SHA: `a4e6b33e1876235f9e16d5a8b90c6109d1371df5`.

If an interrupted write exists, inspect every touched file before further edits. Never reset/clean the canonical worktree to recover a reviewer process.
