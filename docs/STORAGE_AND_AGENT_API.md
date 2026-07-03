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
- Storage now goes through an explicit adapter boundary. The current adapter is
  `json-file`; future durable adapters must preserve the same API contract.

The response also includes `auth` status:

- local development can write without a token;
- production/demo writes require `HERMEST_OWNER_TOKEN`;
- temporary demo-storage reads on public Vercel also require
  `HERMEST_OWNER_TOKEN` so saved demo projects, assets, jobs, and audit rows are
  not listed publicly;
- real SaaS work must replace owner-token auth with per-user sessions and
  project ownership.

## Product Preflight

```text
GET /api/product?route=preflight
```

Reports launch readiness without exposing secret values. The response includes
safe booleans for durable database configuration, object storage, session secret,
token encryption, connector configuration, and product gates.

Expected alpha behavior:

- `launchReady: false`
- `canWriteProductionProjects: false`
- `canRunAgentJobs: false`
- `canAutopublish: false`

This route is meant for deployment verification and for the next agent to see
which 0.3.0/0.4.0 blockers remain before enabling production writes.

## Current Session

```text
GET /api/product?route=session/current
```

Returns the current bootstrap actor and auth mode without exposing any secret
values. This is not final SaaS authentication; it is a stable contract for the
future signed per-user session layer.

Expected alpha behavior:

- local development returns actor `local-dev`;
- public read-only production returns actor `anonymous`;
- owner-token demo requests return actor `owner`;
- signed `hermest.v1` session tokens can be verified when
  `HERMEST_SESSION_SECRET` is configured, but there is no public token issuer yet;
- `session.signedSessionVerifierImplemented` is `true`;
- `session.realUserAuthImplemented` remains `false`.

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

Project records already carry future authorization metadata:

- `workspaceId`
- `ownerUserId`
- `createdBy`
- `updatedBy`

The current bootstrap API preserves existing ownership during updates instead of
accepting ownership changes from request payloads. Real SaaS auth must replace
these defaults with session-backed user/workspace IDs.

Write routes are protected by `api/_lib/auth.js`. If `HERMEST_OWNER_TOKEN` is
configured, callers must send `Authorization: Bearer <token>` or
`x-hermest-owner-token`. This is only a bootstrap guard, not final user auth.

On public Vercel with `HERMEST_ENABLE_DEMO_STORAGE=1`, read routes for projects,
assets, jobs, and audit are also owner-token protected. This keeps the temporary
JSON demo adapter from becoming a public data listing if it is enabled before
real authentication exists.

## Assets

```text
GET /api/product?route=assets
POST /api/product?route=assets
```

Stores metadata for uploaded, found, or generated assets. It does not store
large binary media yet. A real launch needs Blob/S3/R2/Vercel Blob style object
storage plus rights metadata.

`rightsStatus` is constrained to the durable schema enum:
`unknown`, `allowed`, `restricted`, `owned`, or `generated`. Invalid values are
rejected before storage so the JSON adapter and future Postgres adapter keep the
same contract.

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
project create/update/delete, assets, jobs, audit, production storage guard,
asset rights-status validation, external-storage-env guard, and owner-token
demo-storage read/write guards.

## Durable Storage Target

See `docs/DATABASE_SCHEMA_DRAFT.md` for the first Postgres schema target.
