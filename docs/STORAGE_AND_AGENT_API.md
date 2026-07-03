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
