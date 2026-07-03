# Storage And Agent API

Hermest Board now has backend contracts for the product layer that sits behind
the browser board.

## Storage Status

```text
GET /api/product?route=storage/status
```

Reports whether the current deployment can write server-side data safely.

- Local dev: JSON-file writes are enabled under `.data/hermest-board`.
- Public Vercel: writes are disabled unless `HERMEST_ENABLE_DEMO_STORAGE=1`.
- Production SaaS: needs durable storage, user accounts, authorization, and
  encrypted connector token storage.

The response also includes `auth` status:

- local development can write without a token;
- production/demo writes require `HERMEST_OWNER_TOKEN`;
- real SaaS work must replace owner-token auth with per-user sessions and
  project ownership.

## Projects

```text
GET /api/product?route=projects
POST /api/product?route=projects
GET /api/product?route=projects/:id
PUT /api/product?route=projects/:id
PATCH /api/product?route=projects/:id
DELETE /api/product?route=projects/:id
```

A project contains the board title, cards, links, view, plan, roadmap, script,
publish settings, and optional publish pack snapshot.

Write routes are protected by `api/_lib/auth.js`. If `HERMEST_OWNER_TOKEN` is
configured, callers must send `Authorization: Bearer <token>` or
`x-hermest-owner-token`. This is only a bootstrap guard, not final user auth.

## Assets

```text
GET /api/product?route=assets
POST /api/product?route=assets
```

Stores metadata for uploaded, found, or generated assets. It does not store
large binary media yet. A real launch needs Blob/S3/R2/Vercel Blob style object
storage plus rights metadata.

## Jobs

```text
GET /api/product?route=jobs
POST /api/product?route=jobs
GET /api/product?route=jobs/:id
PATCH /api/product?route=jobs/:id
```

Stores publish/render job metadata for local development. Production needs a
durable queue and workers.

Job status values are intentionally constrained to the durable queue target:
`queued`, `running`, `waiting_for_approval`, `blocked`, `failed`, `completed`,
and `cancelled`. A job that has no connector/storage blockers still uses
`waiting_for_approval`; autopublishing remains disabled until explicit human
approval and OAuth safety controls exist.

## Audit

```text
GET /api/product?route=audit
```

Returns the latest local audit events. Production must make audit logs durable
and tamper-resistant enough for support and debugging.

## Agent Plan

```text
POST /api/product?route=agent/plan
```

Accepts a publish pack and returns:

- connector status;
- planned parser/translation/media/render/publish steps;
- blockers such as missing OAuth connectors or durable storage;
- `canAutopublish: false` until explicit approval and connector safety are
  implemented.

## Smoke Checks

```bash
npm run smoke:api
npm run check
```

`smoke:api` runs the product API directly without a server. It verifies local
project create/update/delete, assets, jobs, audit, production storage guard, and
owner-token demo-storage guard.

## Durable Storage Target

See `docs/DATABASE_SCHEMA_DRAFT.md` for the first Postgres schema target.
