# M4 Workspace Runtime — Audit & Implementation Contract

**Gate:** M4 (minimal Project/Client workspace, NOT a heavy CRM)  
**Scope:** SQLite-first, local-first, zero new dependencies, Postgres-portable SQL  
**Target:** User can create client → project → campaign, link content/render/publish jobs, see activity history  

---

## Audit Findings

### Available Persistence

- **`node:sqlite` (DatabaseSync)** — available in Node 22+ WITHOUT `--experimental-sqlite` flag (only ExperimentalWarning to stderr, harmless).  
- **No additional dependencies** (better-sqlite3 NOT installed, pg already present but reserved for future cloud path).  
- **Verdict:** Use `node:sqlite` (DatabaseSync). Zero new deps, fits free/local.

### Existing Patterns (src/local-media/)

- `candidate-persistence.js` — shows async wrapper over storage adapter (getRecord, saveRecord, appendAudit).  
- `job-manager.js` — in-memory Map, eviction, abort control, TDD harness.  
- **Pattern to follow:** sync DB ops wrapped in async facade, minimal surface, config via env.

### Schema Design (docs/DATABASE_SCHEMA_DRAFT.md, db/postgres-schema.sql)

Postgres-native draft includes:
- `app_users`, `workspaces`, `workspace_members` (multi-tenant).  
- `projects`, `assets`, `jobs`, `connectors`, `audit_events`.  
- Foreign keys, GIN indexes, `jsonb` columns, `timestamptz`.

**SQLite-portable subset:**
- REPLACE `uuid` → `text` (client-gen or `randomUUID()`).  
- REPLACE `timestamptz` → `text` (ISO-8601).  
- REPLACE `jsonb` → `text` (JSON strings; app-side parse).  
- REPLACE `gen_random_uuid()` → JS `randomUUID()`.  
- REPLACE `now()` → JS `new Date().toISOString()`.  
- REPLACE GIN index → omit or FTS5 (out of scope for M4).  
- KEEP foreign keys (`PRAGMA foreign_keys = ON`), constraints.

**Migration strategy:** forward-only versioned migrations in `src/workspace/migrations/`, version table.

---

## M4 Minimal Schema (SQLite-portable SQL)

Entities (minimal columns for MVP):

1. **clients**  
   - `id text primary key`  
   - `workspace_id text not null`  
   - `name text not null`  
   - `status text default 'active' check (status in ('active', 'archived'))`  
   - `owner text`  
   - `tags text`  (JSON array)  
   - `created_at text not null`  
   - `updated_at text not null`  

2. **projects**  
   - `id text primary key`  
   - `workspace_id text not null`  
   - `client_id text references clients(id) on delete set null`  
   - `name text not null`  
   - `status text default 'active' check (status in ('active', 'archived', 'completed'))`  
   - `due_date text`  
   - `owner text`  
   - `tags text`  
   - `created_at text not null`  
   - `updated_at text not null`  

3. **campaigns**  
   - `id text primary key`  
   - `workspace_id text not null`  
   - `project_id text not null references projects(id) on delete cascade`  
   - `name text not null`  
   - `status text default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled'))`  
   - `due_date text`  
   - `owner text`  
   - `tags text`  
   - `created_at text not null`  
   - `updated_at text not null`  

4. **content_items**  
   - `id text primary key`  
   - `workspace_id text not null`  
   - `campaign_id text references campaigns(id) on delete set null`  
   - `name text not null`  
   - `type text default 'video' check (type in ('video', 'article', 'image', 'social', 'other'))`  
   - `status text default 'draft' check (status in ('draft', 'in_progress', 'review', 'approved', 'published'))`  
   - `owner text`  
   - `tags text`  
   - `created_at text not null`  
   - `updated_at text not null`  

5. **assets** (existing board assets link here)  
   - `id text primary key`  
   - `workspace_id text not null`  
   - `content_item_id text references content_items(id) on delete set null`  
   - `name text not null`  
   - `url text`  
   - `type text`  
   - `created_at text not null`  
   - `updated_at text not null`  

6. **render_jobs** (existing local-media jobs link here)  
   - `id text primary key`  
   - `workspace_id text not null`  
   - `content_item_id text references content_items(id) on delete set null`  
   - `status text default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled'))`  
   - `payload text`  
   - `result text`  
   - `error text`  
   - `created_at text not null`  
   - `updated_at text not null`  

7. **publish_jobs** (future; placeholder for now)  
   - `id text primary key`  
   - `workspace_id text not null`  
   - `content_item_id text references content_items(id) on delete set null`  
   - `platform text`  
   - `status text default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled'))`  
   - `payload text`  
   - `result text`  
   - `error text`  
   - `created_at text not null`  
   - `updated_at text not null`  

8. **notes**  
   - `id text primary key`  
   - `workspace_id text not null`  
   - `entity_type text not null check (entity_type in ('client', 'project', 'campaign', 'content_item'))`  
   - `entity_id text not null`  
   - `content text not null`  
   - `author text`  
   - `created_at text not null`  

9. **activity_log** (append-only)  
   - `id text primary key`  
   - `workspace_id text not null`  
   - `entity_type text`  
   - `entity_id text`  
   - `action text not null`  
   - `actor text`  
   - `summary text`  
   - `timestamp text not null`  

10. **schema_version** (migration tracker)  
    - `version integer primary key`  
    - `applied_at text not null`  

**Indexes (minimal for M4):**
- `create index idx_projects_client on projects(client_id, updated_at desc)`  
- `create index idx_campaigns_project on campaigns(project_id, updated_at desc)`  
- `create index idx_content_campaign on content_items(campaign_id, updated_at desc)`  
- `create index idx_activity_workspace on activity_log(workspace_id, timestamp desc)`  

**Foreign keys:** enabled via `PRAGMA foreign_keys = ON` on DB open.

---

## Implementation Plan (TDD, local-first, fail-closed)

### 1. Store (`src/workspace/workspace-store.js`)

```js
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export function createWorkspaceStore({ dbPath = process.env.HERMEST_WORKSPACE_DB || ':memory:' } = {}) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  
  // Migration runner
  function migrate() { /* apply src/workspace/migrations/*.sql in order */ }
  
  // CRUD helpers
  function createClient(data) { /* INSERT, return row */ }
  function listClients(filters) { /* SELECT with WHERE/ORDER */ }
  function updateClient(id, data) { /* UPDATE, log activity */ }
  function deleteClient(id) { /* DELETE or soft-delete */ }
  // ... repeat for projects, campaigns, content_items, etc.
  
  function appendActivity(entity, entityId, action, actor, summary) {
    // INSERT INTO activity_log
  }
  
  function getActivity(filters) { /* SELECT with limits */ }
  
  function exportJson() { /* dump all tables to portable JSON */ }
  function importJson(data) { /* restore from JSON, idempotent */ }
  
  function close() { db.close(); }
  
  return { db, migrate, createClient, listClients, /* ... */, close };
}
```

### 2. Migrations (`src/workspace/migrations/`)

- `0001_initial_schema.sql` — clients, projects, campaigns, content_items, assets, render_jobs, publish_jobs, notes, activity_log, schema_version.  
- `0002_*.sql` (future) — forward-only, tracked in schema_version.  

Migration runner:
1. Read current `select version from schema_version order by version desc limit 1`.  
2. Apply `*.sql` files where `version > current`, sorted.  
3. Insert `insert into schema_version (version, applied_at) values (?, ?)` after each.  
4. Test: fresh DB migrates to latest; re-run is idempotent (no-op).

### 3. API Routes (`api/product.js` or new `api/workspace.js`)

Path prefix: `/api/product?route=workspace/*` or `/api/workspace/*`.

**Routes:**
- `GET /workspace/clients` → list (search by name/tag/status).  
- `POST /workspace/clients` → create.  
- `GET /workspace/clients/:id` → get.  
- `PATCH /workspace/clients/:id` → update.  
- `DELETE /workspace/clients/:id` → delete (soft or hard).  
- (Repeat for projects, campaigns, content_items, notes.)  
- `GET /workspace/activity` → recent activity (workspace-scoped, limit 100).  
- `POST /workspace/export` → JSON export.  
- `POST /workspace/import` → JSON import (idempotent, fail on version/schema mismatch).  
- `POST /workspace/link` → link content_item ↔ render_job / publish_job.  

**Permissions:**
- Single-user by default (workspace_id = 'workspace_local').  
- Optional team mode: if `HERMEST_WORKSPACE_MULTI_USER=1`, check `owner` field.  

**Activity logging:**
Every mutation → `appendActivity(entity, entity_id, action, actor, summary)`.

### 4. Tests (`test/unit/workspace-store.test.mjs`)

- **Migration:** fresh :memory: DB migrates to latest; re-run is idempotent.  
- **CRUD:** create client → project → campaign → content_item → link render_job → activity log.  
- **Search:** list with filters (name, tag, status), pagination.  
- **Export/Import:** export JSON, re-import into fresh :memory: DB, assert equality.  
- **Permissions:** single-user mode (all rows have workspace_id); negative test: cross-workspace access denied (future team mode).  
- **Foreign keys:** delete client with ON DELETE SET NULL cascades to projects.  

**One full smoke:**
1. Create client "Acme Corp".  
2. Create project "Q1 Campaign" under Acme.  
3. Create campaign "Video Series" under project.  
4. Create content_item "Ep 1" under campaign.  
5. Link render_job (mock job id).  
6. Append activity "content_item.created".  
7. Export JSON.  
8. Fresh :memory: DB.  
9. Import JSON.  
10. Assert: same client/project/campaign/content/activity rows.

**No real external services** (no Postgres, no API calls). All tests via :memory: or temp file.

---

## Frontend-Facing API Contract

**Base:** `/api/product?route=workspace/*` (or `/api/workspace/*` if dedicated handler added).

### `GET /workspace/clients`

**Request:** `?search=<term>&status=<active|archived>&tag=<tag>&limit=50&offset=0`  
**Response:**
```json
{
  "ok": true,
  "clients": [
    {
      "id": "cli_abc123",
      "workspace_id": "workspace_local",
      "name": "Acme Corp",
      "status": "active",
      "owner": "user_vadim",
      "tags": ["enterprise", "tech"],
      "created_at": "2026-07-23T10:00:00.000Z",
      "updated_at": "2026-07-23T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

### `POST /workspace/clients`

**Request:**
```json
{
  "name": "Acme Corp",
  "status": "active",
  "owner": "user_vadim",
  "tags": ["enterprise", "tech"]
}
```
**Response:**
```json
{
  "ok": true,
  "client": { "id": "cli_abc123", ... }
}
```

### `GET /workspace/projects?client_id=<id>`

**Response:**
```json
{
  "ok": true,
  "projects": [
    {
      "id": "proj_xyz789",
      "workspace_id": "workspace_local",
      "client_id": "cli_abc123",
      "name": "Q1 Campaign",
      "status": "active",
      "due_date": "2026-09-01T00:00:00.000Z",
      "owner": "user_vadim",
      "tags": ["video", "social"],
      "created_at": "2026-07-23T10:05:00.000Z",
      "updated_at": "2026-07-23T10:05:00.000Z"
    }
  ]
}
```

### `POST /workspace/campaigns`

**Request:**
```json
{
  "project_id": "proj_xyz789",
  "name": "Video Series",
  "status": "draft",
  "due_date": "2026-08-15T00:00:00.000Z",
  "owner": "user_vadim",
  "tags": ["youtube", "instagram"]
}
```
**Response:**
```json
{
  "ok": true,
  "campaign": { "id": "camp_def456", ... }
}
```

### `GET /workspace/campaigns/:id/content`

**Response:**
```json
{
  "ok": true,
  "content_items": [
    {
      "id": "cont_ghi789",
      "campaign_id": "camp_def456",
      "name": "Episode 1",
      "type": "video",
      "status": "in_progress",
      "owner": "user_vadim",
      "tags": ["tutorial"],
      "created_at": "2026-07-23T10:10:00.000Z",
      "updated_at": "2026-07-23T10:10:00.000Z"
    }
  ]
}
```

### `POST /workspace/link`

**Request:**
```json
{
  "content_item_id": "cont_ghi789",
  "render_job_id": "job_jkl012"
}
```
**Response:**
```json
{
  "ok": true,
  "linked": true
}
```
(Updates `render_jobs.content_item_id`, appends activity.)

### `GET /workspace/activity?workspace_id=workspace_local&limit=100`

**Response:**
```json
{
  "ok": true,
  "activity": [
    {
      "id": "act_mno345",
      "workspace_id": "workspace_local",
      "entity_type": "content_item",
      "entity_id": "cont_ghi789",
      "action": "created",
      "actor": "user_vadim",
      "summary": "Created content item 'Episode 1' in campaign 'Video Series'",
      "timestamp": "2026-07-23T10:10:00.000Z"
    }
  ]
}
```

### `POST /workspace/export`

**Response:**
```json
{
  "ok": true,
  "export": {
    "version": 1,
    "exported_at": "2026-07-23T12:00:00.000Z",
    "clients": [ ... ],
    "projects": [ ... ],
    "campaigns": [ ... ],
    "content_items": [ ... ],
    "assets": [ ... ],
    "render_jobs": [ ... ],
    "publish_jobs": [ ... ],
    "notes": [ ... ],
    "activity_log": [ ... ]
  }
}
```

### `POST /workspace/import`

**Request:** same shape as export.  
**Response:**
```json
{
  "ok": true,
  "imported": {
    "clients": 5,
    "projects": 12,
    "campaigns": 8,
    "content_items": 25,
    "activity_log": 150
  }
}
```

---

## Postgres Path (noted for future, NOT implemented now)

When migrating to Postgres:
1. Keep same column semantics (text ids → uuid, text timestamps → timestamptz, text JSON → jsonb).  
2. Add `gen_random_uuid()` defaults, GIN indexes, full-text search (tsquery/tsvector).  
3. Multi-tenant: enforce workspace_id in RLS policies or application-layer WHERE clauses.  
4. Keep JSON import/export portable: app-side normalization.  

**No code changes needed now** — just keep SQL portable (no SQLite-only pragmas in migrations, no Postgres-only functions).

---

## Security & Privacy

- **Secrets:** NO secrets in DB rows (workspace name, client name, owner = safe text).  
- **Logs:** Activity log = summary text only, NO stack traces / paths / secrets.  
- **DB file:** configurable path, default under local data dir (not /tmp, not public).  
- **Permissions:** single-user by default; team mode gated by flag + owner checks.  

---

## Exit Criteria (Quality Gate M4)

1. `npm run test:unit` — all workspace-store tests green (migration, CRUD, export/import, foreign keys).  
2. `npm run check` — full suite green (validate, unit, smoke, build).  
3. One real smoke: create client→project→campaign→content_item→link render_job→export→import→assert equality.  
4. Frontend contract documented above — UI lane can build workspace panel without guessing.  
5. NO `git push` (committed locally only).  
6. NO index.html/src/app.js changes (backend lane only).  

---

## Blockers (if any)

- **NONE.** `node:sqlite` (DatabaseSync) works in Node 22 WITHOUT flag (verified). Zero new deps. Proceed.

---

**FINAL OUTPUT CHECKLIST:**
- [ ] Files changed (src/workspace/*, test/unit/workspace-store.test.mjs, api/product.js or api/workspace.js).  
- [ ] Commit SHAs (small atomic commits, English imperative).  
- [ ] Test results (`npm run test:unit`, `npm run check` exit codes).  
- [ ] Frontend API contract (documented above).  
- [ ] Blockers (none, or honest list).

---

**Status:** Audit complete. Ready to implement.
