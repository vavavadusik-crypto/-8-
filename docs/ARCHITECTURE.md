# Architecture

## Current Shape

Hermest Board is a browser-first interactive product prototype:

- one-page Vite frontend;
- small Vercel API skeleton under `api/`;
- local board state in `localStorage`;
- import/export through JSON;
- browser voiceover through `speechSynthesis`;
- browser recording through `MediaRecorder` and `getDisplayMedia`;
- publish pack generation as structured JSON.

## Current API Skeleton

- `GET /api/health` - deployment health check;
- `GET /api/connectors/status` - reports whether connector env vars are present without exposing secrets;
- `GET /api/public/sources` - public/free source registry;
- `GET /api/research/search?q=...` - server-side public source search;
- `GET /api/connectors/start?provider=...` - OAuth start URL skeleton for per-user account connection;
- `GET /api/connectors/callback` - placeholder until sessions/token exchange exist;
- `GET /api/user-config/schema` - documents what users can configure without seeing owner secrets;
- `POST /api/publish-pack/validate` - validates publish pack shape before real publishing exists.

## Deploy Boundary

The deployed frontend is safe to host publicly because it does not contain API secrets.

All future autonomous actions need a backend:

- OAuth for TikTok, YouTube, and Instagram;
- platform upload APIs;
- parser jobs;
- translation jobs;
- media generation jobs;
- asset storage;
- task queue;
- audit logs and retry handling.

## Future Backend Modules

Recommended modules:

- `projects`: stores boards, roadmaps, scripts, and publish packs;
- `assets`: stores uploaded and generated media;
- `connectors`: stores OAuth state and refresh tokens server-side;
- `agent-queue`: runs parser, translation, rendering, and publishing tasks;
- `audit-log`: stores every automated action and error;
- `scheduler`: schedules drafts and publications;
- `metrics`: stores published links and platform metrics.

## Data Model Draft

```text
Project
  id
  title
  boardJson
  plan
  roadmap
  script
  publishPack
  createdAt
  updatedAt

Asset
  id
  projectId
  type
  source
  storageUrl
  rightsStatus
  metadata

PublishJob
  id
  projectId
  platform
  language
  status
  assetIds
  publishedUrl
  errors
```

## Security Rules

- Never store platform client secrets in browser code.
- Treat generated and downloaded media as untrusted until scanned and rights-checked.
- Require explicit user approval before public posting until the product has mature safety controls.
- Keep a permanent audit trail for publishing actions.
