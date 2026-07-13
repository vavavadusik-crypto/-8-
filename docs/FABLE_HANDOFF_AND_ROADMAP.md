# Fable Handoff And Roadmap

> Historical handoff, superseded on 2026-07-13 by `PRODUCT_NORTH_STAR.md`,
> `DELIVERY_MASTER_PLAN.md`, `CONTENT_PIPELINE_SPEC.md` and
> `RELEASE_READINESS.md`. Keep this file for provenance; do not use it to
> redefine current scope or release order.

This file is the handoff document for the next model/agent that continues
Hermest Board.

## One-Line Goal

Turn Hermest Board from a strong alpha recording/demo board into a real
multi-user product that can store projects, prepare media/publishing jobs, and
eventually publish approved videos to connected user accounts.

## Current Location

- Local project: `/home/architect/ai-dev-station/workspace/hermest-board`
- GitHub repo: `https://github.com/vavavadusik-crypto/-8-.git`
- Production URL: `https://hermest-board.vercel.app`
- Current version: `0.2.0`
- Current branch: `main`
- Last known product commit before this handoff refresh: `8cfe66b docs: add fable ultracode upgrade mandate`

## Current Product State

Hermest Board currently has:

- interactive draggable/resizable/rotatable cards;
- per-card images;
- links between cards;
- plan and roadmap fields;
- script generation from board content;
- browser voiceover;
- browser screen recording workflow;
- publish pack generation for TikTok, YouTube video, YouTube Shorts, and Instagram Reels;
- public source search API;
- connector status/start skeletons;
- product API contract for storage/projects/assets/jobs/audit/agent plan;
- bootstrap write guard for future demo storage via `HERMEST_OWNER_TOKEN`;
- production write guard to avoid storing private user data on ephemeral Vercel storage;
- GitHub Actions deploy workflow.

The app is still alpha. It is not ready for paid users or private customer data.

## Important Safety Rules

- Do not commit secrets, `.env`, `.vercel`, `.data`, `node_modules`, `dist`, or desktop key files.
- Do not paste or print token values in terminal output or docs.
- Public Vercel writes must stay blocked until durable storage, auth, and authorization exist.
- Autopublish must stay disabled until OAuth, encrypted token storage, policy checks, and human approval exist.
- `HERMEST_OWNER_TOKEN` is only a bootstrap write guard. It is not a replacement
  for real per-user auth.
- Keep within Vercel Hobby serverless function limits. The product API is intentionally combined under one endpoint:
  - `GET /api/product?route=storage/status`
  - `GET|POST /api/product?route=projects`
  - `GET|PUT|PATCH|DELETE /api/product?route=projects/<id>`
  - `GET|POST /api/product?route=assets`
  - `GET|POST /api/product?route=jobs`
  - `GET|PATCH /api/product?route=jobs/<id>`
  - `GET /api/product?route=audit`
  - `POST /api/product?route=agent/plan`

## How To Verify Current State

Run from the project directory:

```bash
npm install
npm run check
git status --short --branch
```

`npm run check` includes API smoke coverage through `npm run smoke:api`.

Live checks:

```bash
curl https://hermest-board.vercel.app/api/health
curl 'https://hermest-board.vercel.app/api/product?route=storage/status'
curl 'https://hermest-board.vercel.app/api/product?route=projects'
curl -X POST 'https://hermest-board.vercel.app/api/product?route=agent/plan' \
  -H 'content-type: application/json' \
  --data '{"platforms":["youtube_video"],"tools":["parser"],"languages":["ru"]}'
```

Expected production behavior:

- health returns `version: 0.2.0`;
- storage status returns `writeEnabled: false`, `durable: false`;
- project list returns JSON;
- project write returns `501 server_storage_not_configured`;
- agent plan returns blockers for missing connectors/storage.
- if demo storage is enabled later on public Vercel, project/asset/job/audit
  read and write routes must require owner token until real per-user auth exists.

## Known Issue / Observation

Vercel logs may show a Node deprecation warning on `GET /api/product` while the
endpoint still returns `200` JSON. Treat it as a warning unless it becomes a
runtime failure. Do not spend a large pass on it before storage/auth work unless
it starts failing requests.

## Roadmap To 1.0.0

### 0.3.0 Durable Storage And Auth Decision

Goal: choose the real backend foundation.

Recommended decision points:

- database: Neon Postgres, Supabase Postgres, Vercel Postgres/Marketplace, or another durable backend;
- object storage: Vercel Blob, S3/R2, Supabase Storage, or equivalent;
- auth: Clerk, Auth.js, Supabase Auth, or custom session auth.

Acceptance criteria:

- project data persists outside `localStorage`;
- every project belongs to a user/workspace;
- unauthenticated users cannot read/write private projects;
- production `POST /api/product?route=projects` works only for authorized users.

### 0.4.0 Project Persistence

Goal: replace demo/local JSON storage with a real adapter.

Tasks:

- add a storage adapter interface;
- keep `api/_lib/auth.js` as the temporary write guard until real auth replaces it;
- implement Postgres-backed projects;
- implement asset metadata;
- implement audit rows;
- add migrations or schema docs;
- add import/export compatibility with current JSON board state.

Acceptance criteria:

- create/list/get/update/delete project works on production with auth;
- local fallback still works for development;
- no private data is stored in frontend-only state unless user chooses export.

### 0.5.0 User Accounts And Sessions

Goal: make the product multi-user safe.

Tasks:

- add sign-in/sign-out;
- add current-user API;
- add workspace/project ownership;
- add authorization checks in every product API route;
- add rate limits or basic abuse controls.

Acceptance criteria:

- user A cannot access user B project IDs;
- all write routes require authentication;
- audit log records actor and project.

### 0.6.0 OAuth Connectors

Goal: real account connection for YouTube, TikTok, and Instagram.

Tasks:

- implement OAuth state/session validation;
- implement callback token exchange;
- encrypt refresh/access tokens server-side;
- store per-user connector status;
- document platform app setup and required permissions.

Acceptance criteria:

- connector status is per user, not owner-global;
- no platform token reaches the browser;
- disconnect/reconnect works;
- failed OAuth leaves useful audit/error records.

### 0.7.0 Agent Job Queue

Goal: make parser/translator/media/publish steps executable jobs.

Tasks:

- implement durable job table/queue;
- add job statuses: queued, running, waiting_for_approval, blocked, failed, completed;
- add retry/error model;
- add worker entrypoints for parser, translation, media plan, render plan, publish draft;
- keep `POST /api/product?route=agent/plan` as dry-run preview.

Acceptance criteria:

- jobs survive deploys/restarts;
- user can see job progress and errors;
- no job can publish publicly without approval.

### 0.8.0 Media Pipeline

Goal: turn board content into render-ready video assets.

Tasks:

- asset upload and storage;
- generated/found media metadata;
- rights status and source links;
- subtitles/captions model;
- render specs for 9:16 and 16:9;
- optional video generation provider integration.

Acceptance criteria:

- publish pack can reference stored assets;
- every external asset has rights/source status;
- render plan is deterministic and downloadable.

### 0.9.0 Publishing Approval And Platform Drafts

Goal: prepare real publishing without unsafe automation.

Tasks:

- approval screen before upload/publish;
- per-platform draft generation;
- YouTube upload/draft support first;
- TikTok/Instagram only when app permissions and platform policies allow;
- store published URLs and platform errors.

Acceptance criteria:

- no automatic public post without user approval;
- failed uploads are retryable and logged;
- published/draft URLs are stored per project.

### 1.0.0 Security, QA, Launch Readiness

Goal: make it safe enough to give to real external users.

Tasks:

- Playwright browser tests for main workflows;
- API tests for authorization and validation;
- monitoring/error reporting;
- privacy policy and terms;
- backup/export plan;
- usage analytics;
- billing only after core workflow is stable;
- security review by a stronger model/reviewer.

Acceptance criteria:

- CI blocks broken builds;
- critical flows are tested;
- production secrets are only in server env/secret stores;
- docs explain setup from empty clone to deployed product;
- Fable/reviewer signs off on security and architecture gaps.

## Suggested Fable Prompt

```text
You are continuing Hermest Board.

Repo: https://github.com/vavavadusik-crypto/-8-
Production: https://hermest-board.vercel.app
Local path on the machine: /home/architect/ai-dev-station/workspace/hermest-board

First read:
- README.md
- docs/FABLE_HANDOFF_AND_ROADMAP.md
- docs/ARCHITECTURE.md
- docs/STORAGE_AND_AGENT_API.md
- docs/DATABASE_SCHEMA_DRAFT.md
- db/postgres-schema.sql
- docs/SECURITY_REVIEW.md
- docs/PRODUCT_READINESS.md
- docs/WORKLOG.md
- .github/workflows/deploy-vercel.yml

Then run:
- npm install
- npm run check
- git status --short --branch

Review the whole product for security, architecture, bugs, and missing tests.
Do not print or commit secrets. Do not remove production write guards until real
durable storage, auth, and authorization exist.

Next best work: implement phase 0.3.0/0.4.0 by choosing durable storage/auth and
replacing demo JSON storage with a real authenticated storage adapter.
```
