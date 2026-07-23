import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceStore } from "../../src/workspace/workspace-store.js";

describe("workspace-store", () => {
  it("migrates fresh :memory: DB to latest schema", () => {
    const store = createWorkspaceStore({ dbPath: ":memory:" });
    const version = store.db.prepare("select version from schema_version order by version desc limit 1").get();
    assert.equal(version.version, 1);
    store.close();
  });

  it("migration is idempotent (re-run is no-op)", () => {
    const store = createWorkspaceStore({ dbPath: ":memory:" });
    const v1 = store.db.prepare("select version from schema_version order by version desc limit 1").get();
    store.close();

    const store2 = createWorkspaceStore({ dbPath: ":memory:" });
    const v2 = store2.db.prepare("select version from schema_version order by version desc limit 1").get();
    assert.equal(v1.version, v2.version);
    store2.close();
  });

  it("CRUD: create client → project → campaign → content_item → link render_job → activity log", () => {
    const store = createWorkspaceStore({ dbPath: ":memory:" });

    const client = store.createClient({ name: "Acme Corp", owner: "user_vadim", tags: ["enterprise", "tech"] });
    assert.equal(client.name, "Acme Corp");
    assert.deepEqual(client.tags, ["enterprise", "tech"]);
    assert.ok(client.id.startsWith("cli_"));

    const project = store.createProject({ client_id: client.id, name: "Q1 Campaign", owner: "user_vadim", tags: ["video"] });
    assert.equal(project.name, "Q1 Campaign");
    assert.equal(project.client_id, client.id);
    assert.ok(project.id.startsWith("proj_"));

    const campaign = store.createCampaign({ project_id: project.id, name: "Video Series", owner: "user_vadim", tags: ["youtube"] });
    assert.equal(campaign.name, "Video Series");
    assert.equal(campaign.project_id, project.id);
    assert.ok(campaign.id.startsWith("camp_"));

    const contentItem = store.createContentItem({ campaign_id: campaign.id, name: "Episode 1", type: "video", owner: "user_vadim", tags: ["tutorial"] });
    assert.equal(contentItem.name, "Episode 1");
    assert.equal(contentItem.campaign_id, campaign.id);
    assert.ok(contentItem.id.startsWith("cont_"));

    store.db.prepare(`
      insert into render_jobs (id, workspace_id, content_item_id, status, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
    `).run("job_test123", "workspace_local", null, "queued", new Date().toISOString(), new Date().toISOString());

    const link = store.linkRenderJob(contentItem.id, "job_test123");
    assert.equal(link.linked, true);

    const activity = store.getActivity({ limit: 10 });
    assert.ok(activity.length >= 5);
    assert.ok(activity.some(a => a.action === "created" && a.entity_type === "client"));
    assert.ok(activity.some(a => a.action === "render_job_linked" && a.entity_type === "content_item"));

    store.close();
  });

  it("list with filters (search, status, tag, limit)", () => {
    const store = createWorkspaceStore({ dbPath: ":memory:" });
    store.createClient({ name: "Alpha Inc", status: "active", owner: "user_vadim", tags: ["enterprise"] });
    store.createClient({ name: "Beta LLC", status: "archived", owner: "user_vadim", tags: ["startup"] });
    store.createClient({ name: "Gamma Corp", status: "active", owner: "user_vadim", tags: ["enterprise", "tech"] });

    const active = store.listClients({ status: "active" });
    assert.equal(active.length, 2);

    const search = store.listClients({ search: "Beta" });
    assert.equal(search.length, 1);
    assert.equal(search[0].name, "Beta LLC");

    const tagFiltered = store.listClients({ tag: "enterprise" });
    assert.equal(tagFiltered.length, 2);

    const limited = store.listClients({ limit: 2 });
    assert.equal(limited.length, 2);

    store.close();
  });

  it("update client", () => {
    const store = createWorkspaceStore({ dbPath: ":memory:" });
    const client = store.createClient({ name: "Acme Corp", owner: "user_vadim" });
    const updated = store.updateClient(client.id, { name: "Acme Inc", status: "archived" });
    assert.equal(updated.name, "Acme Inc");
    assert.equal(updated.status, "archived");
    store.close();
  });

  it("delete client", () => {
    const store = createWorkspaceStore({ dbPath: ":memory:" });
    const client = store.createClient({ name: "Acme Corp", owner: "user_vadim" });
    const result = store.deleteClient(client.id);
    assert.equal(result.ok, true);
    const found = store.getClient(client.id);
    assert.equal(found, null);
    store.close();
  });

  it("foreign key: delete client with projects (client_id → null)", () => {
    const store = createWorkspaceStore({ dbPath: ":memory:" });
    const client = store.createClient({ name: "Acme Corp", owner: "user_vadim" });
    const project = store.createProject({ client_id: client.id, name: "Q1 Campaign", owner: "user_vadim" });
    store.deleteClient(client.id);
    const updatedProject = store.getProject(project.id);
    assert.equal(updatedProject.client_id, null);
    store.close();
  });

  it("foreign key: delete project with campaigns (cascade)", () => {
    const store = createWorkspaceStore({ dbPath: ":memory:" });
    const project = store.createProject({ name: "Q1 Campaign", owner: "user_vadim" });
    const campaign = store.createCampaign({ project_id: project.id, name: "Video Series", owner: "user_vadim" });
    store.deleteProject(project.id);
    const found = store.getCampaign(campaign.id);
    assert.equal(found, null);
    store.close();
  });

  it("export JSON", () => {
    const store = createWorkspaceStore({ dbPath: ":memory:" });
    store.createClient({ name: "Acme Corp", owner: "user_vadim" });
    store.createProject({ name: "Q1 Campaign", owner: "user_vadim" });
    const exported = store.exportJson();
    assert.equal(exported.version, 1);
    assert.ok(exported.clients.length >= 1);
    assert.ok(exported.projects.length >= 1);
    assert.ok(exported.activity_log.length >= 2);
    store.close();
  });

  it("import JSON (idempotent, re-import same data)", () => {
    const store1 = createWorkspaceStore({ dbPath: ":memory:" });
    store1.createClient({ name: "Acme Corp", owner: "user_vadim" });
    const exported = store1.exportJson();
    store1.close();

    const store2 = createWorkspaceStore({ dbPath: ":memory:" });
    const imported = store2.importJson(exported);
    assert.ok(imported.clients >= 1);
    assert.ok(imported.activity_log >= 1);

    const clients = store2.listClients();
    assert.equal(clients.length, 1);
    assert.equal(clients[0].name, "Acme Corp");

    const importedAgain = store2.importJson(exported);
    assert.equal(importedAgain.clients, 0);
    store2.close();
  });

  it("SMOKE: full workflow (create→link→export→import→assert equality)", () => {
    const store1 = createWorkspaceStore({ dbPath: ":memory:" });

    const client = store1.createClient({ name: "Acme Corp", owner: "user_vadim", tags: ["enterprise"] });
    const project = store1.createProject({ client_id: client.id, name: "Q1 Campaign", owner: "user_vadim", tags: ["video"] });
    const campaign = store1.createCampaign({ project_id: project.id, name: "Video Series", owner: "user_vadim", tags: ["youtube"] });
    const contentItem = store1.createContentItem({ campaign_id: campaign.id, name: "Episode 1", type: "video", owner: "user_vadim", tags: ["tutorial"] });

    store1.db.prepare(`
      insert into render_jobs (id, workspace_id, content_item_id, status, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?)
    `).run("job_smoke", "workspace_local", null, "queued", new Date().toISOString(), new Date().toISOString());
    store1.linkRenderJob(contentItem.id, "job_smoke");

    const exported = store1.exportJson();
    store1.close();

    const store2 = createWorkspaceStore({ dbPath: ":memory:" });
    store2.importJson(exported);

    const clients = store2.listClients();
    const projects = store2.listProjects();
    const campaigns = store2.listCampaigns();
    const contentItems = store2.listContentItems();
    const activity = store2.getActivity({ limit: 100 });

    assert.equal(clients.length, 1);
    assert.equal(clients[0].name, "Acme Corp");
    assert.deepEqual(clients[0].tags, ["enterprise"]);

    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, "Q1 Campaign");
    assert.equal(projects[0].client_id, client.id);

    assert.equal(campaigns.length, 1);
    assert.equal(campaigns[0].name, "Video Series");
    assert.equal(campaigns[0].project_id, project.id);

    assert.equal(contentItems.length, 1);
    assert.equal(contentItems[0].name, "Episode 1");
    assert.equal(contentItems[0].campaign_id, campaign.id);

    assert.ok(activity.length >= 5);
    assert.ok(activity.some(a => a.action === "render_job_linked"));

    const renderJob = store2.db.prepare("select * from render_jobs where id = ?").get("job_smoke");
    assert.equal(renderJob.content_item_id, contentItem.id);

    store2.close();
  });

  it("backup workspace (scoped export)", () => {
    const store = createWorkspaceStore({ dbPath: ":memory:" });
    store.createClient({ workspace_id: "ws_alpha", name: "Client A", owner: "user_vadim" });
    store.createClient({ workspace_id: "ws_beta", name: "Client B", owner: "user_vadim" });
    const backup = store.backupWorkspace({ workspace_id: "ws_alpha" });
    assert.equal(backup.version, 1);
    assert.equal(backup.clients.length, 1);
    assert.equal(backup.clients[0].workspace_id, "ws_alpha");
    store.close();
  });

  it("delete workspace (cascade all entities)", () => {
    const store = createWorkspaceStore({ dbPath: ":memory:" });
    store.createClient({ workspace_id: "ws_doomed", name: "Doomed Client", owner: "user_vadim" });
    store.createProject({ workspace_id: "ws_doomed", name: "Doomed Project", owner: "user_vadim" });
    const result = store.deleteWorkspace("ws_doomed");
    assert.equal(result.ok, true);
    assert.equal(result.workspace_id, "ws_doomed");
    assert.ok(result.deleted >= 2);
    const clients = store.listClients({ workspace_id: "ws_doomed" });
    const projects = store.listProjects({ workspace_id: "ws_doomed" });
    assert.equal(clients.length, 0);
    assert.equal(projects.length, 0);
    store.close();
  });
});
