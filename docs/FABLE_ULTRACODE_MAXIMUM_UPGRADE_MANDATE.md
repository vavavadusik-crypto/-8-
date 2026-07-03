# Fable 5 Ultracode Maximum Upgrade Mandate

This document is written for Fable 5 Ultracode as the highest-effort review and
upgrade mandate for Hermest Board.

## Executive Request

Fable 5 Ultracode, please perform a complete, uncompromising, production-grade
review and improvement pass on the entire Hermest Board product.

Do not treat this as a routine code cleanup. Treat it as a full product,
security, architecture, user experience, deployment, data, and business-readiness
engagement. The objective is to move Hermest Board from a strong alpha prototype
toward a credible, secure, maintainable, deployable, user-ready product.

Use your maximum long-horizon engineering capability. Be rigorous, direct,
evidence-driven, and implementation-oriented. Improve what can be safely
improved now, document what cannot be completed without credentials or product
decisions, and leave the project in a stronger state than you found it.

## Current Product Context

- Local project path: `/home/architect/ai-dev-station/workspace/hermest-board`
- GitHub repository: `https://github.com/vavavadusik-crypto/-8-`
- Production URL: `https://hermest-board.vercel.app`
- Current product version: `0.2.0 alpha`
- Current state: interactive board plus backend API contracts, production write
  guard, API smoke tests, GitHub Actions deployment, and draft Postgres schema.

Read these first:

1. `README.md`
2. `docs/FABLE_HANDOFF_AND_ROADMAP.md`
3. `docs/FABLE_ULTRACODE_MAXIMUM_UPGRADE_MANDATE.md`
4. `docs/ARCHITECTURE.md`
5. `docs/STORAGE_AND_AGENT_API.md`
6. `docs/DATABASE_SCHEMA_DRAFT.md`
7. `db/postgres-schema.sql`
8. `docs/PRODUCT_READINESS.md`
9. `docs/WORKLOG.md`
10. `.github/workflows/deploy-vercel.yml`

Then run:

```bash
npm install
npm run check
git status --short --branch
```

Live baseline checks:

```bash
curl https://hermest-board.vercel.app/api/health
curl 'https://hermest-board.vercel.app/api/product?route=storage/status'
curl 'https://hermest-board.vercel.app/api/product?route=projects'
curl -X POST 'https://hermest-board.vercel.app/api/product?route=agent/plan' \
  -H 'content-type: application/json' \
  --data '{"platforms":["youtube_video"],"tools":["parser"],"languages":["ru"]}'
```

Expected production behavior today:

- health returns version `0.2.0`;
- storage writes are disabled in production;
- product read/status routes return JSON;
- project writes return `501 server_storage_not_configured`;
- agent plan reports blockers until connectors, storage, and auth are real.

## Research Basis And Standards

Use this source hierarchy when making decisions:

1. The repository code and live production behavior.
2. Official vendor documentation and standards.
3. Recognized security, accessibility, and deployment standards.
4. Community reports only as secondary operational heuristics.
5. Your own engineering inference, clearly labeled where it is inference.

Official and standards references consulted for this mandate:

- Anthropic Claude Fable official page:
  `https://www.anthropic.com/claude/fable`
- Anthropic model documentation for Claude Fable 5 and Claude Mythos 5:
  `https://platform.claude.com/docs/en/about-claude/models/introducing-claude-fable-5-and-mythos-5`
- Anthropic prompting best practices:
  `https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices`
- Anthropic context engineering for agents:
  `https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents`
- Anthropic "How teams use Claude Code" PDF:
  `https://www-cdn.anthropic.com/58284b19e702b49db9302d5b6f135ad8871e7658.pdf`
- OWASP Application Security Verification Standard:
  `https://owasp.org/www-project-application-security-verification-standard/`
- OWASP Top 10:
  `https://owasp.org/www-project-top-ten/`
- Vercel production checklist:
  `https://vercel.com/docs/production-checklist`
- Vercel deployment checks:
  `https://vercel.com/docs/deployment-checks`
- Vercel deployments documentation:
  `https://vercel.com/docs/deployments`
- W3C WCAG 2.2:
  `https://www.w3.org/TR/WCAG22/`
- W3C WCAG overview:
  `https://www.w3.org/WAI/standards-guidelines/wcag/`

Community signals reviewed only as non-authoritative heuristics:

- Long-run Fable 5 Ultracode session reports:
  `https://www.reddit.com/r/claudeskills/comments/1u3e3fl/the_fable_5_ultracode_65hr_36m_token_run_finished/`
- Fable and Ultracode discussion in Claude Code community:
  `https://www.reddit.com/r/ClaudeCode/comments/1ub6raj/what_can_ultracode_fable_do_for_me/`
- Vercel production checklist discussion:
  `https://www.reddit.com/r/vercel/comments/1n77cdy/are_you_using_vercels_production_checklist_for/`

Use community posts only to infer workflow risks such as long-run token cost,
context drift, and the need for explicit checkpoints. Do not treat community
claims as factual authority without verification.

## Operating Mode For Fable 5 Ultracode

Operate in a disciplined high-effort loop:

1. Explore the repository and production state.
2. Build a concrete risk and opportunity map.
3. Produce a prioritized plan.
4. Implement in small, reviewable batches.
5. Run tests and live checks after meaningful changes.
6. Commit intentionally with clear messages.
7. Update docs and handoff notes.
8. Repeat until the product is materially stronger or a real blocker appears.

Do not only write recommendations. Implement safe improvements directly. Where
implementation requires missing credentials, paid accounts, OAuth app approval,
platform review, or product-owner decisions, create precise tasks and document
the blocker.

## Non-Negotiable Safety Constraints

- Do not commit secrets, tokens, `.env`, `.vercel`, `.data`, `node_modules`,
  `dist`, desktop key files, or local browser profiles.
- Do not print secret values in terminal output or markdown.
- Do not remove production write guards until durable storage, real auth, and
  authorization are implemented and verified.
- Do not enable autopublishing without OAuth, encrypted token storage, platform
  policy compliance, and explicit human approval.
- Do not fake production readiness. If a feature is a contract, scaffold, or
  prototype, label it honestly.
- Do not exceed Vercel Hobby serverless limits unless the deployment plan is
  intentionally changed and documented.
- Do not introduce destructive git commands.
- Do not overwrite unrelated local work.

## Full-Scope Audit Mandate

Review and improve every layer below.

### 1. Product And Strategy

Assess whether Hermest Board has a coherent path from interactive learning
board to AI-assisted content production and publishing workspace.

Deliver:

- product gap list;
- target user workflows;
- core value proposition;
- feature cuts for beta;
- risks that could prevent monetization;
- recommended version milestones from alpha to 1.0.0.

### 2. Architecture

Review the frontend, API design, storage abstraction, job model, connector
model, and deployment boundary.

Deliver:

- architecture findings by severity;
- module boundary recommendations;
- storage adapter plan;
- auth/session plan;
- queue/worker plan;
- migration path that preserves current local JSON export/import.

### 3. Security

Use OWASP ASVS and OWASP Top 10 as the primary web security frame.

Review:

- access control;
- auth bypass risks;
- secret handling;
- token storage;
- OAuth state validation;
- input validation;
- output encoding;
- API method enforcement;
- SSRF and external fetch risks;
- rate limiting and abuse controls;
- audit log integrity;
- dependency risk;
- deployment configuration;
- CSP and security headers.

Deliver:

- `docs/SECURITY_REVIEW.md`;
- severity-ranked findings;
- concrete fixes;
- tests for security-critical behavior;
- list of security work blocked by missing provider credentials or auth choice.

### 4. Data And Durable Storage

Review `docs/DATABASE_SCHEMA_DRAFT.md` and `db/postgres-schema.sql`.

Deliver:

- schema review;
- migration strategy;
- storage adapter interface;
- recommended provider choice tradeoffs;
- row ownership and workspace authorization plan;
- data retention and export strategy.

### 5. Authentication And Authorization

The current `HERMEST_OWNER_TOKEN` guard is only a bootstrap guard.

Design the real model:

- users;
- workspaces;
- project ownership;
- roles;
- sessions;
- per-route authorization;
- audit actor attribution.

Deliver:

- recommended auth stack;
- route protection matrix;
- threat model;
- phased implementation plan.

### 6. OAuth Connectors And Publishing

Review YouTube, TikTok, and Instagram connector design.

Do not implement unsafe autopublishing prematurely.

Deliver:

- OAuth state/callback architecture;
- encrypted token storage plan;
- connector status model;
- platform policy blockers;
- human approval gate design;
- draft/upload/publish state machine;
- failure and retry handling.

### 7. Agent Jobs And Media Pipeline

Review the planned parser, translator, media generator, renderer, and publisher
pipeline.

Deliver:

- durable job lifecycle;
- queue implementation plan;
- worker interface;
- status/progress model;
- retry/cancellation model;
- media rights model;
- render asset model for 9:16 and 16:9 outputs.

### 8. Frontend And UX

Review the board UI as a serious creative/workflow tool, not only a demo.

Assess:

- interaction ergonomics;
- card management;
- board navigation;
- project save/load flow;
- publish pack flow;
- empty/error/loading states;
- mobile behavior;
- visual clarity;
- recording mode;
- accessibility.

Deliver:

- UX audit;
- prioritized frontend fixes;
- accessibility improvements guided by WCAG 2.2;
- visual regression or screenshot checks where appropriate.

### 9. Testing And QA

Current checks include `validate`, `smoke:api`, build, and screenshot smoke.

Expand toward:

- API unit tests;
- authorization tests;
- import/export tests;
- publish pack validation tests;
- storage adapter tests;
- Playwright end-to-end tests;
- live deployment checks.

Deliver:

- test gap matrix;
- implemented high-value tests;
- CI integration updates.

### 10. Deployment, CI/CD, And Observability

Use Vercel production checklist and deployment checks as the deployment review
frame.

Review:

- GitHub Actions;
- Vercel deploy flow;
- environment variable handling;
- production aliases;
- log visibility;
- error tracking;
- deployment protection;
- rollback plan;
- build reproducibility.

Deliver:

- CI/CD findings;
- observability plan;
- deploy checklist;
- live verification script.

### 11. Performance And Reliability

Review:

- frontend bundle size;
- localStorage limits;
- image handling;
- API latency and failure modes;
- external research API timeouts;
- Vercel function limits;
- graceful degradation.

Deliver:

- performance findings;
- reliability fixes;
- timeout/retry strategy for external APIs.

### 12. Documentation And Developer Experience

Review the entire docs set.

Deliver:

- concise setup guide from clean clone;
- production deployment guide;
- env variable guide;
- security and operations guide;
- Fable/Codex handoff updates;
- changelog/worklog updates.

## Required Deliverables From The Ultracode Pass

At minimum, produce:

1. A severity-ranked full product audit.
2. A security review grounded in OWASP ASVS and OWASP Top 10.
3. A product and UX improvement plan.
4. A storage/auth implementation plan.
5. Implemented safe improvements with commits.
6. Updated tests and `npm run check` passing.
7. Updated docs and handoff notes.
8. Live production verification after deployment.

Preferred documents to add or update:

- `docs/SECURITY_REVIEW.md`
- `docs/PRODUCT_AUDIT.md`
- `docs/ROADMAP_TO_1_0.md`
- `docs/OPERATIONS.md`
- `docs/CHANGELOG.md`
- `docs/WORKLOG.md`

## Definition Of Maximum Improvement

Maximum improvement does not mean reckless feature sprawl.

It means:

- highest leverage first;
- no fake readiness;
- secure by default;
- production constraints respected;
- every critical path verified;
- every risky decision documented;
- user value improved;
- future agents can continue without rediscovering context.

## Direct Instruction To Fable 5 Ultracode

Please take ownership of the review with professional seriousness.

Read the whole repository. Read the docs. Run the checks. Inspect production.
Find weak assumptions. Find missing tests. Find security gaps. Find UX friction.
Find architecture traps. Find deployment risks. Find product opportunities.

Then improve the product in a disciplined sequence.

If a change is safe and clearly valuable, implement it.
If a change needs a credential, provider approval, paid plan, or product-owner
decision, document the exact blocker and the precise next action.

Leave Hermest Board closer to a real 1.0.0 product than it was before you
started.
