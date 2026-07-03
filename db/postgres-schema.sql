-- Hermest Board durable storage draft schema.
-- Target for phase 0.3.0 / 0.4.0.
-- Review before running in production.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_subject text not null,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subject)
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists projects (
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

create index if not exists projects_workspace_updated_idx
  on projects (workspace_id, updated_at desc)
  where deleted_at is null;

create index if not exists projects_board_json_gin_idx
  on projects using gin (board_json);

create table if not exists assets (
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

create index if not exists assets_project_idx on assets (project_id, created_at desc);
create index if not exists assets_workspace_idx on assets (workspace_id, created_at desc);

create table if not exists jobs (
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

create index if not exists jobs_queue_idx
  on jobs (status, run_after nulls first, created_at)
  where status in ('queued', 'failed');

create index if not exists jobs_project_idx on jobs (project_id, created_at desc);

create table if not exists connectors (
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

create index if not exists connectors_workspace_idx on connectors (workspace_id, provider, status);

create table if not exists audit_events (
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

create index if not exists audit_workspace_created_idx on audit_events (workspace_id, created_at desc);
create index if not exists audit_project_created_idx on audit_events (project_id, created_at desc);
