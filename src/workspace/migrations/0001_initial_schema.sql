-- M4 Workspace initial schema (SQLite-portable, Postgres-compatible)
-- Version: 1
-- Applied: <auto>

create table if not exists clients (
  id text primary key,
  workspace_id text not null,
  name text not null,
  status text default 'active' check (status in ('active', 'archived')),
  owner text,
  tags text,
  created_at text not null,
  updated_at text not null
);

create table if not exists projects (
  id text primary key,
  workspace_id text not null,
  client_id text,
  name text not null,
  status text default 'active' check (status in ('active', 'archived', 'completed')),
  due_date text,
  owner text,
  tags text,
  created_at text not null,
  updated_at text not null,
  foreign key (client_id) references clients(id) on delete set null
);

create table if not exists campaigns (
  id text primary key,
  workspace_id text not null,
  project_id text not null,
  name text not null,
  status text default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled')),
  due_date text,
  owner text,
  tags text,
  created_at text not null,
  updated_at text not null,
  foreign key (project_id) references projects(id) on delete cascade
);

create table if not exists content_items (
  id text primary key,
  workspace_id text not null,
  campaign_id text,
  name text not null,
  type text default 'video' check (type in ('video', 'article', 'image', 'social', 'other')),
  status text default 'draft' check (status in ('draft', 'in_progress', 'review', 'approved', 'published')),
  owner text,
  tags text,
  created_at text not null,
  updated_at text not null,
  foreign key (campaign_id) references campaigns(id) on delete set null
);

create table if not exists assets (
  id text primary key,
  workspace_id text not null,
  content_item_id text,
  name text not null,
  url text,
  type text,
  created_at text not null,
  updated_at text not null,
  foreign key (content_item_id) references content_items(id) on delete set null
);

create table if not exists render_jobs (
  id text primary key,
  workspace_id text not null,
  content_item_id text,
  status text default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  payload text,
  result text,
  error text,
  created_at text not null,
  updated_at text not null,
  foreign key (content_item_id) references content_items(id) on delete set null
);

create table if not exists publish_jobs (
  id text primary key,
  workspace_id text not null,
  content_item_id text,
  platform text,
  status text default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  payload text,
  result text,
  error text,
  created_at text not null,
  updated_at text not null,
  foreign key (content_item_id) references content_items(id) on delete set null
);

create table if not exists notes (
  id text primary key,
  workspace_id text not null,
  entity_type text not null check (entity_type in ('client', 'project', 'campaign', 'content_item')),
  entity_id text not null,
  content text not null,
  author text,
  created_at text not null
);

create table if not exists activity_log (
  id text primary key,
  workspace_id text not null,
  entity_type text,
  entity_id text,
  action text not null,
  actor text,
  summary text,
  timestamp text not null
);

create table if not exists schema_version (
  version integer primary key,
  applied_at text not null
);

create index if not exists idx_projects_client on projects(client_id, updated_at desc);
create index if not exists idx_campaigns_project on campaigns(project_id, updated_at desc);
create index if not exists idx_content_campaign on content_items(campaign_id, updated_at desc);
create index if not exists idx_activity_workspace on activity_log(workspace_id, timestamp desc);
