# Database Schema Draft

This is the draft durable-storage schema for phase `0.3.0` / `0.4.0`.

The current product uses local JSON storage by default and blocks public
production writes. A guarded `postgres-jsonb` bootstrap adapter can store current
portable API records in a generic `hermest_records` table, but this schema is
still the intended typed target for the first full production Postgres adapter.

Runnable draft SQL lives in `db/postgres-schema.sql`.

## Design Goals

- Every private row belongs to a user/workspace.
- Board JSON stays portable and compatible with current export/import.
- Assets and jobs can evolve without breaking project records.
- Audit logs are append-only from the application perspective.
- Connector tokens are never stored in browser state.

## Extensions

```sql
create extension if not exists pgcrypto;
```

## Users And Workspaces

```sql
create table app_users (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_subject text not null,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
```

## Projects

```sql
create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_user_id uuid not null references app_users(id) on delete restrict,
  title text not null,
  board_json jsonb not null,
  publish_pack jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index projects_workspace_updated_idx
  on projects (workspace_id, updated_at desc)
  where deleted_at is null;

create index projects_board_json_gin_idx
  on projects using gin (board_json);
```

## Assets

```sql
create table assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  created_by_user_id uuid references app_users(id) on delete set null,
  type text not null,
  source text not null,
  title text not null,
  storage_url text,
  source_url text,
  rights_status text not null default 'unknown'
    check (rights_status in ('unknown', 'allowed', 'restricted', 'owned', 'generated')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assets_project_idx on assets (project_id, created_at desc);
create index assets_workspace_idx on assets (workspace_id, created_at desc);
```

## Jobs

```sql
create table jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  created_by_user_id uuid references app_users(id) on delete set null,
  type text not null,
  status text not null check (
    status in (
      'queued',
      'running',
      'waiting_for_approval',
      'blocked',
      'failed',
      'completed',
      'cancelled'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error jsonb,
  run_after timestamptz,
  locked_at timestamptz,
  locked_by text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_queue_idx
  on jobs (status, run_after nulls first, created_at)
  where status in ('queued', 'failed');

create index jobs_project_idx on jobs (project_id, created_at desc);
```

## Connectors

```sql
create table connectors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  provider text not null check (provider in ('youtube', 'tiktok', 'instagram')),
  account_label text,
  scopes text[] not null default '{}',
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  status text not null default 'connected'
    check (status in ('connected', 'expired', 'revoked', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, provider)
);

create index connectors_workspace_idx on connectors (workspace_id, provider, status);
```

Token encryption should be handled in application code or a managed secret/KMS
layer. Do not store plaintext tokens.

## Audit Log

```sql
create table audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  actor_user_id uuid references app_users(id) on delete set null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_workspace_created_idx on audit_events (workspace_id, created_at desc);
create index audit_project_created_idx on audit_events (project_id, created_at desc);
```

## Adapter Mapping

The current API records map like this:

- `projects.project.board_json` -> `projects.board_json`
- `projects.project.publish` / publish pack -> `projects.publish_pack`
- local `assets` records -> `assets`
- local `jobs` records -> `jobs`
- local `connectors` records -> `connectors`
- local `audit` records -> `audit_events`

## First Adapter Acceptance Criteria

- `GET /api/product?route=storage/status` reports a durable adapter.
- `POST /api/product?route=projects` requires an authenticated user.
- project list only returns rows for the current workspace.
- project update/delete enforces workspace membership.
- audit events record actor and project.
- production write guard is removed only after these checks are in place.
