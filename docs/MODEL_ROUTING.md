# Hermest Board — Model Routing

Observed: 2026-07-13
Status: RECOMMENDED POLICY / ACCOUNT AVAILABILITY UNVERIFIED

Development-agent routing and product-runtime routing are independent. Catalog presence never proves account/model/quota readiness.

## Development

| Role | Primary | Fallback | Gate |
|---|---|---|---|
| Architecture/ADR/security | Claude Code Opus high/max | Codex GPT-5.6 Sol | final Claude review required |
| Bounded implementation | Claude Code Sonnet high | Codex workhorse available in current runtime | worktree/path ownership + TDD |
| Mechanical low-risk work | Claude Haiku/low | low-cost independent model | no architecture/security authority |
| Final release review | Claude Code Opus read-only | Codex only preliminary | Claude login and actual run required |

Claude CLI `2.1.203` is installed but not logged in. This is `BLOCKED_CLAUDE_AUTH`, not a passed gate. Local OmniCoder is excluded.

## Product runtime: free-first recommendation

| Role | Candidate primary | Independent fallback/QC | Notes |
|---|---|---|---|
| Research synthesis | stable Gemini Flash class + Board search layer | Groq Compound/GPT-OSS class | model never invents retrieval evidence |
| Script | stable Gemini Flash class | Mistral free class or Groq; Claude quality escalation | validate against brief/sources |
| Storyboard/vision | multimodal Gemini Flash class | Cloudflare vision model/Kimi class | structured JSON mandatory |
| Translation | Gemini Flash-Lite class | Mistral/Cloudflare translation | preserve names, numbers, timings |
| Text QC | different family from generator | Groq/Mistral; Claude escalation | deterministic checks first |
| Moderation | deterministic policy + dedicated moderation | human escalation | no fallback laundering after refusal |

Exact IDs and availability are selected only after live names-only capability probe and role-specific eval. Preview/deprecated models cannot be production primary.

## Provider selector

```text
capability → privacy → lifecycle/deprecation → free/paid policy
→ quota/health → role eval score → latency/cost
```

Normalized errors: `RATE_LIMITED`, `CAPACITY`, `TIMEOUT`, `AUTH`, `BILLING`, `INVALID_REQUEST`, `CAPABILITY_MISMATCH`, `SAFETY_REFUSAL`, `SCHEMA_FAILURE`.

Fallback is allowed for transient rate/capacity/timeout/5xx. It is not automatic for auth, billing, invalid requests or safety refusal.

## Rotation and budgets

- Credentials appear only as `credential_ref` and never in prompts/logs/manifests.
- Rotation is allowed only among authorized user-owned pools and never to bypass organization/project quotas.
- Respect `retry-after`; quarantine 401/403 credential and alert.
- Modes: `free_only`, `balanced`, `premium`; no silent free→paid transition.
- Per job: attempts/fallbacks, token/tool/deadline caps and reserved QC budget.
- Preserve actual provider/model/version, usage, fallback reason, schema/prompt version and deterministic validator results.

## Eval

- Research: citation precision, unsupported claims, freshness and URL validity.
- Script: brief adherence, factual consistency, tone and blind human preference.
- Storyboard: schema pass, narrative coverage, continuity and shot usefulness.
- Translation: names/numbers/timings plus human rubric.
- QC: seeded-defect recall and false-pass rate.
- All: p50/p95 latency, cost per accepted artifact, quota burn and fallback rate.

Use a different model family as judge, pin exact release snapshots and re-evaluate after model alias/prompt/schema/policy changes.

Official references:

- https://docs.anthropic.com/en/docs/about-claude/models/overview
- https://docs.anthropic.com/en/docs/claude-code/model-config
- https://developers.openai.com/codex/models
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://console.groq.com/docs/rate-limits
- https://openrouter.ai/docs/api/reference/limits
- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://docs.mistral.ai/admin/billing-usage/subscriptions
