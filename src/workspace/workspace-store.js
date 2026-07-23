import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

export function createWorkspaceStore({ dbPath = process.env.HERMEST_WORKSPACE_DB || ":memory:" } = {}) {
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");

  function migrate() {
    db.exec(`
      create table if not exists schema_version (
        version integer primary key,
        applied_at text not null
      )
    `);
    const currentVersion = getCurrentVersion();
    const migrations = listMigrations();
    for (const { version, path } of migrations) {
      if (version <= currentVersion) continue;
      const sql = readFileSync(path, "utf8");
      db.exec(sql);
      const now = new Date().toISOString();
      db.prepare("insert into schema_version (version, applied_at) values (?, ?)").run(version, now);
    }
  }

  function getCurrentVersion() {
    try {
      const row = db.prepare("select version from schema_version order by version desc limit 1").get();
      return row?.version || 0;
    } catch {
      return 0;
    }
  }

  function listMigrations() {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
    return files.map(file => {
      const version = parseInt(file.split("_")[0], 10);
      return { version, path: join(MIGRATIONS_DIR, file) };
    });
  }

  function createClient(data) {
    const id = `cli_${randomUUID()}`;
    const now = new Date().toISOString();
    const workspaceId = data.workspace_id || "workspace_local";
    const tags = JSON.stringify(data.tags || []);
    db.prepare(`
      insert into clients (id, workspace_id, name, status, owner, tags, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspaceId, data.name, data.status || "active", data.owner || null, tags, now, now);
    appendActivity("client", id, "created", data.owner, `Created client '${data.name}'`);
    return getClient(id);
  }

  function getClient(id) {
    const row = db.prepare("select * from clients where id = ?").get(id);
    return row ? normalizeClient(row) : null;
  }

  function listClients(filters = {}) {
    let sql = "select * from clients where 1=1";
    const params = [];
    if (filters.workspace_id) {
      sql += " and workspace_id = ?";
      params.push(filters.workspace_id);
    }
    if (filters.status) {
      sql += " and status = ?";
      params.push(filters.status);
    }
    if (filters.search) {
      sql += " and name like ?";
      params.push(`%${filters.search}%`);
    }
    sql += " order by updated_at desc";
    if (filters.limit) {
      sql += " limit ?";
      params.push(filters.limit);
    }
    if (filters.offset) {
      sql += " offset ?";
      params.push(filters.offset);
    }
    const rows = db.prepare(sql).all(...params);
    return rows.map(normalizeClient);
  }

  function updateClient(id, data) {
    const existing = getClient(id);
    if (!existing) throw new Error("client_not_found");
    const now = new Date().toISOString();
    const rawTags = existing.tags ? JSON.stringify(existing.tags) : "[]";
    const tags = data.tags !== undefined ? JSON.stringify(data.tags) : rawTags;
    db.prepare(`
      update clients set
        name = ?, status = ?, owner = ?, tags = ?, updated_at = ?
      where id = ?
    `).run(
      data.name !== undefined ? data.name : existing.name,
      data.status !== undefined ? data.status : existing.status,
      data.owner !== undefined ? data.owner : existing.owner,
      tags,
      now,
      id
    );
    appendActivity("client", id, "updated", data.owner || existing.owner, `Updated client '${data.name || existing.name}'`);
    return getClient(id);
  }

  function deleteClient(id) {
    const existing = getClient(id);
    if (!existing) throw new Error("client_not_found");
    db.prepare("delete from clients where id = ?").run(id);
    appendActivity("client", id, "deleted", null, `Deleted client '${existing.name}'`);
    return { ok: true, id };
  }

  function createProject(data) {
    const id = `proj_${randomUUID()}`;
    const now = new Date().toISOString();
    const workspaceId = data.workspace_id || "workspace_local";
    const tags = JSON.stringify(data.tags || []);
    db.prepare(`
      insert into projects (id, workspace_id, client_id, name, status, due_date, owner, tags, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspaceId, data.client_id || null, data.name, data.status || "active", data.due_date || null, data.owner || null, tags, now, now);
    appendActivity("project", id, "created", data.owner, `Created project '${data.name}'`);
    return getProject(id);
  }

  function getProject(id) {
    const row = db.prepare("select * from projects where id = ?").get(id);
    return row ? normalizeProject(row) : null;
  }

  function listProjects(filters = {}) {
    let sql = "select * from projects where 1=1";
    const params = [];
    if (filters.workspace_id) {
      sql += " and workspace_id = ?";
      params.push(filters.workspace_id);
    }
    if (filters.client_id) {
      sql += " and client_id = ?";
      params.push(filters.client_id);
    }
    if (filters.status) {
      sql += " and status = ?";
      params.push(filters.status);
    }
    if (filters.search) {
      sql += " and name like ?";
      params.push(`%${filters.search}%`);
    }
    sql += " order by updated_at desc";
    if (filters.limit) {
      sql += " limit ?";
      params.push(filters.limit);
    }
    if (filters.offset) {
      sql += " offset ?";
      params.push(filters.offset);
    }
    const rows = db.prepare(sql).all(...params);
    return rows.map(normalizeProject);
  }

  function updateProject(id, data) {
    const existing = getProject(id);
    if (!existing) throw new Error("project_not_found");
    const now = new Date().toISOString();
    const tags = data.tags !== undefined ? JSON.stringify(data.tags) : existing.tags;
    db.prepare(`
      update projects set
        name = ?, status = ?, due_date = ?, owner = ?, tags = ?, updated_at = ?
      where id = ?
    `).run(
      data.name !== undefined ? data.name : existing.name,
      data.status !== undefined ? data.status : existing.status,
      data.due_date !== undefined ? data.due_date : existing.due_date,
      data.owner !== undefined ? data.owner : existing.owner,
      tags,
      now,
      id
    );
    appendActivity("project", id, "updated", data.owner, `Updated project '${data.name || existing.name}'`);
    return getProject(id);
  }

  function deleteProject(id) {
    const existing = getProject(id);
    if (!existing) throw new Error("project_not_found");
    db.prepare("delete from projects where id = ?").run(id);
    appendActivity("project", id, "deleted", null, `Deleted project '${existing.name}'`);
    return { ok: true, id };
  }

  function createCampaign(data) {
    const id = `camp_${randomUUID()}`;
    const now = new Date().toISOString();
    const workspaceId = data.workspace_id || "workspace_local";
    const tags = JSON.stringify(data.tags || []);
    db.prepare(`
      insert into campaigns (id, workspace_id, project_id, name, status, due_date, owner, tags, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspaceId, data.project_id, data.name, data.status || "draft", data.due_date || null, data.owner || null, tags, now, now);
    appendActivity("campaign", id, "created", data.owner, `Created campaign '${data.name}'`);
    return getCampaign(id);
  }

  function getCampaign(id) {
    const row = db.prepare("select * from campaigns where id = ?").get(id);
    return row ? normalizeCampaign(row) : null;
  }

  function listCampaigns(filters = {}) {
    let sql = "select * from campaigns where 1=1";
    const params = [];
    if (filters.workspace_id) {
      sql += " and workspace_id = ?";
      params.push(filters.workspace_id);
    }
    if (filters.project_id) {
      sql += " and project_id = ?";
      params.push(filters.project_id);
    }
    if (filters.status) {
      sql += " and status = ?";
      params.push(filters.status);
    }
    if (filters.search) {
      sql += " and name like ?";
      params.push(`%${filters.search}%`);
    }
    sql += " order by updated_at desc";
    if (filters.limit) {
      sql += " limit ?";
      params.push(filters.limit);
    }
    if (filters.offset) {
      sql += " offset ?";
      params.push(filters.offset);
    }
    const rows = db.prepare(sql).all(...params);
    return rows.map(normalizeCampaign);
  }

  function updateCampaign(id, data) {
    const existing = getCampaign(id);
    if (!existing) throw new Error("campaign_not_found");
    const now = new Date().toISOString();
    const tags = data.tags !== undefined ? JSON.stringify(data.tags) : existing.tags;
    db.prepare(`
      update campaigns set
        name = ?, status = ?, due_date = ?, owner = ?, tags = ?, updated_at = ?
      where id = ?
    `).run(
      data.name !== undefined ? data.name : existing.name,
      data.status !== undefined ? data.status : existing.status,
      data.due_date !== undefined ? data.due_date : existing.due_date,
      data.owner !== undefined ? data.owner : existing.owner,
      tags,
      now,
      id
    );
    appendActivity("campaign", id, "updated", data.owner, `Updated campaign '${data.name || existing.name}'`);
    return getCampaign(id);
  }

  function deleteCampaign(id) {
    const existing = getCampaign(id);
    if (!existing) throw new Error("campaign_not_found");
    db.prepare("delete from campaigns where id = ?").run(id);
    appendActivity("campaign", id, "deleted", null, `Deleted campaign '${existing.name}'`);
    return { ok: true, id };
  }

  function createContentItem(data) {
    const id = `cont_${randomUUID()}`;
    const now = new Date().toISOString();
    const workspaceId = data.workspace_id || "workspace_local";
    const tags = JSON.stringify(data.tags || []);
    db.prepare(`
      insert into content_items (id, workspace_id, campaign_id, name, type, status, owner, tags, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspaceId, data.campaign_id || null, data.name, data.type || "video", data.status || "draft", data.owner || null, tags, now, now);
    appendActivity("content_item", id, "created", data.owner, `Created content item '${data.name}'`);
    return getContentItem(id);
  }

  function getContentItem(id) {
    const row = db.prepare("select * from content_items where id = ?").get(id);
    return row ? normalizeContentItem(row) : null;
  }

  function listContentItems(filters = {}) {
    let sql = "select * from content_items where 1=1";
    const params = [];
    if (filters.workspace_id) {
      sql += " and workspace_id = ?";
      params.push(filters.workspace_id);
    }
    if (filters.campaign_id) {
      sql += " and campaign_id = ?";
      params.push(filters.campaign_id);
    }
    if (filters.status) {
      sql += " and status = ?";
      params.push(filters.status);
    }
    if (filters.search) {
      sql += " and name like ?";
      params.push(`%${filters.search}%`);
    }
    sql += " order by updated_at desc";
    if (filters.limit) {
      sql += " limit ?";
      params.push(filters.limit);
    }
    if (filters.offset) {
      sql += " offset ?";
      params.push(filters.offset);
    }
    const rows = db.prepare(sql).all(...params);
    return rows.map(normalizeContentItem);
  }

  function updateContentItem(id, data) {
    const existing = getContentItem(id);
    if (!existing) throw new Error("content_item_not_found");
    const now = new Date().toISOString();
    const tags = data.tags !== undefined ? JSON.stringify(data.tags) : existing.tags;
    db.prepare(`
      update content_items set
        name = ?, type = ?, status = ?, owner = ?, tags = ?, updated_at = ?
      where id = ?
    `).run(
      data.name !== undefined ? data.name : existing.name,
      data.type !== undefined ? data.type : existing.type,
      data.status !== undefined ? data.status : existing.status,
      data.owner !== undefined ? data.owner : existing.owner,
      tags,
      now,
      id
    );
    appendActivity("content_item", id, "updated", data.owner, `Updated content item '${data.name || existing.name}'`);
    return getContentItem(id);
  }

  function deleteContentItem(id) {
    const existing = getContentItem(id);
    if (!existing) throw new Error("content_item_not_found");
    db.prepare("delete from content_items where id = ?").run(id);
    appendActivity("content_item", id, "deleted", null, `Deleted content item '${existing.name}'`);
    return { ok: true, id };
  }

  function linkRenderJob(contentItemId, renderJobId) {
    const item = getContentItem(contentItemId);
    if (!item) throw new Error("content_item_not_found");
    const now = new Date().toISOString();
    db.prepare("update render_jobs set content_item_id = ?, updated_at = ? where id = ?").run(contentItemId, now, renderJobId);
    appendActivity("content_item", contentItemId, "render_job_linked", null, `Linked render job ${renderJobId}`);
    return { ok: true, linked: true };
  }

  function appendActivity(entityType, entityId, action, actor, summary) {
    const id = `act_${randomUUID()}`;
    const now = new Date().toISOString();
    const workspaceId = "workspace_local";
    db.prepare(`
      insert into activity_log (id, workspace_id, entity_type, entity_id, action, actor, summary, timestamp)
      values (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspaceId, entityType || null, entityId || null, action, actor || null, summary || null, now);
  }

  function getActivity(filters = {}) {
    let sql = "select * from activity_log where 1=1";
    const params = [];
    if (filters.workspace_id) {
      sql += " and workspace_id = ?";
      params.push(filters.workspace_id);
    }
    if (filters.entity_type) {
      sql += " and entity_type = ?";
      params.push(filters.entity_type);
    }
    if (filters.entity_id) {
      sql += " and entity_id = ?";
      params.push(filters.entity_id);
    }
    sql += " order by timestamp desc";
    if (filters.limit) {
      sql += " limit ?";
      params.push(filters.limit);
    }
    const rows = db.prepare(sql).all(...params);
    return rows;
  }

  function exportJson() {
    const tables = ["clients", "projects", "campaigns", "content_items", "assets", "render_jobs", "publish_jobs", "notes", "activity_log"];
    const data = { version: 1, exported_at: new Date().toISOString() };
    for (const table of tables) {
      data[table] = db.prepare(`select * from ${table}`).all();
    }
    return data;
  }

  function importJson(data) {
    if (data.version !== 1) throw new Error("incompatible_export_version");
    const tables = ["clients", "projects", "campaigns", "content_items", "assets", "render_jobs", "publish_jobs", "notes", "activity_log"];
    const imported = {};
    for (const table of tables) {
      const rows = data[table] || [];
      imported[table] = 0;
      for (const row of rows) {
        const columns = Object.keys(row).join(", ");
        const placeholders = Object.keys(row).map(() => "?").join(", ");
        const values = Object.values(row);
        const result = db.prepare(`insert or ignore into ${table} (${columns}) values (${placeholders})`).run(...values);
        imported[table] += result.changes || 0;
      }
    }
    return imported;
  }

  function close() {
    db.close();
  }

  function normalizeClient(row) {
    return { ...row, tags: JSON.parse(row.tags || "[]") };
  }

  function normalizeProject(row) {
    return { ...row, tags: JSON.parse(row.tags || "[]") };
  }

  function normalizeCampaign(row) {
    return { ...row, tags: JSON.parse(row.tags || "[]") };
  }

  function normalizeContentItem(row) {
    return { ...row, tags: JSON.parse(row.tags || "[]") };
  }

  migrate();

  return {
    db,
    createClient,
    getClient,
    listClients,
    updateClient,
    deleteClient,
    createProject,
    getProject,
    listProjects,
    updateProject,
    deleteProject,
    createCampaign,
    getCampaign,
    listCampaigns,
    updateCampaign,
    deleteCampaign,
    createContentItem,
    getContentItem,
    listContentItems,
    updateContentItem,
    deleteContentItem,
    linkRenderJob,
    appendActivity,
    getActivity,
    exportJson,
    importJson,
    close
  };
}
