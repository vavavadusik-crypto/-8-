# Architecture

## Current Shape

Hermest Board is a browser-first interactive product prototype:

- one-page Vite frontend;
- Vercel API layer under `api/`;
- local board state in `localStorage`;
- import/export through JSON;
- browser voiceover through `speechSynthesis`;
- browser recording through `MediaRecorder` and `getDisplayMedia`;
- publish pack generation as structured JSON.

## Current API Layer

- `GET /api/health` - deployment health check;
- `GET /api/connectors/status` - reports whether connector env vars are present without exposing secrets;
- `GET /api/public/sources` - public/free source registry;
- `GET /api/research/search?q=...` - server-side public source search;
- `GET /api/connectors/start?provider=...` - OAuth start URL skeleton for per-user account connection;
- `GET /api/connectors/callback` - placeholder until sessions/token exchange exist;
- `GET /api/user-config/schema` - documents what users can configure without seeing owner secrets;
- `POST /api/publish-pack/validate` - validates publish pack shape before real publishing exists;
- `GET /api/product?route=storage/status` - reports storage durability and production blockers;
- `GET /api/product?route=preflight` - reports production-readiness gates without exposing secret values;
- `GET /api/product?route=projects` and `POST /api/product?route=projects` - project list/create contract;
- `GET`, `PUT`, `PATCH`, `DELETE /api/product?route=projects/:id` - project detail/update/delete contract;
- `GET`, `POST /api/product?route=assets` - asset metadata contract;
- `GET`, `POST /api/product?route=jobs` and `GET`, `PATCH /api/product?route=jobs/:id` - job contract;
- `GET /api/product?route=audit` - latest audit events;
- `POST /api/product?route=agent/plan` - deterministic backend plan preview for the publish pack.

## Deploy Boundary

The deployed frontend is safe to host publicly because it does not contain API secrets.

All autonomous actions need a durable backend:

- OAuth for TikTok, YouTube, and Instagram;
- platform upload APIs;
- parser jobs;
- translation jobs;
- media generation jobs;
- asset storage;
- task queue;
- audit logs and retry handling.

The current JSON-file storage adapter is safe for local development. On public
Vercel it refuses writes unless demo storage is explicitly enabled, because
serverless `/tmp` storage is ephemeral and not suitable for private user data.
The product API calls storage through an adapter boundary so the next durable
Postgres/Supabase/Neon implementation can replace file IO without rewriting
route handlers.

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
