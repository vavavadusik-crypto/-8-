# Hermest Board — Agent Orchestration

Дата: 2026-07-13
Статус: ACTIVE EXECUTION POLICY

## 1. Authority

Sol is the sole product orchestrator and final verifier. Workers propose, research, implement or review bounded scopes; they cannot redefine Product North Star, publish externally, deploy, push or accept their own output.

## 2. Required agents

Claude Code is a mandatory independent participant:

- Opus high/max: architecture, security, difficult review and release critique;
- Sonnet high: bounded TDD implementation/refactoring;
- Haiku/low: only low-risk mechanical inventory/docs.

Current local blocker as of 2026-07-13: CLI installed (`2.1.203`) but not authenticated. Required operator action: run `claude` and `/login` (or `claude auth login`). Until then Claude-dependent gates remain pending; other work may proceed but final release acceptance cannot claim this requirement was met.

Other agents/workers are selected by demonstrated fit, not brand:

- Hermes subagents: focused research/review;
- OpenCode/Codex/Claude Code: isolated coding/review scopes;
- web research: official docs and repository/license evidence;
- Graphify: discovery/navigation, never source-of-truth alone.

Local OmniCoder is excluded.

## 3. Parallel lanes

Only orthogonal scopes run concurrently:

1. product/architecture and docs;
2. GitHub/provider research;
3. pure domain contracts/tests;
4. renderer/worker implementation;
5. frontend integration;
6. independent security/release review.

Two workers never edit the same file set. Architecture/contracts are frozen before downstream implementation starts.

## 4. Worker brief contract

Every brief includes goal/non-goals, absolute root, allowed paths, current branch/snapshot, source documents, secret constraints, expected artifacts, exact tests and Russian summary format. A worker returns:

- modified paths;
- tests/commands with actual exit codes;
- artifacts and hashes;
- blockers/limits;
- continuation/session handle when safe;
- claims requiring parent verification.

## 5. Limit and failure strategy

- Use 5–15 turn bounded scopes.
- Save checkpoint after each vertical behavior and before model limits.
- Limit/quota/timeout creates `partial|blocked_limit` handoff, never success.
- Persist enough information to resume with another model without replaying the entire chat.
- Prefer small commits after independent verification; never mix feature lines.
- One provider/model failure routes to a declared fallback only if quality/security class permits.

## 6. Model routing principles

Development routing and product-runtime routing are separate. Provider availability is checked live; catalog presence is not readiness. Selection uses eval fixtures for correctness, structured output, Russian narration/script quality, citations, latency and measured cost/quota. API key rotation may rotate only user-owned authorized credentials within provider policy; it must not bypass provider rate limits, account restrictions or platform terms.

Detailed model table will be updated after current official-source research and live provider probes that expose names/status only.

## 7. Review gates

For every code slice:

1. RED test observed;
2. GREEN targeted test;
3. relevant full gate;
4. independent spec review;
5. independent code/security review;
6. orchestrator rereads diff and reruns decisive commands;
7. checkpoint commit;
8. no push/deploy without owner approval.

Final release additionally requires Claude Code review against the final stable snapshot, unless Vadim explicitly waives the requirement after being shown the auth blocker.
