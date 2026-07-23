/**
 * Integration test: workspace API (M4)
 *
 * Calls the api/product.js handler in-process (same pattern as scripts/smoke-api.mjs)
 * instead of requiring a live dev server, so the quality gate is self-contained.
 *
 * Storage is exercised through the PRODUCT default (HERMEST_DATA_DIR only) — no
 * HERMEST_WORKSPACE_DB override — because each request opens and closes its own
 * store, so an in-memory default would silently drop every write.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import product from "../../api/product.js";

const originalEnv = {
  dataDir: process.env.HERMEST_DATA_DIR,
  workspaceDb: process.env.HERMEST_WORKSPACE_DB,
  vercel: process.env.VERCEL
};

let dataDir = null;

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

async function callApi(route, { method = "GET", query = {}, body = null } = {}) {
  const response = mockResponse();
  const fullQuery = { route, ...query };
  const search = new URLSearchParams(fullQuery).toString();
  await product({
    method,
    query: fullQuery,
    url: `/api/product?${search}`,
    headers: body ? { "content-type": "application/json" } : {},
    body
  }, response);
  return { status: response.statusCode, data: response.payload ?? {} };
}

function createClient(name, extra = {}) {
  return callApi("workspace/clients", {
    method: "POST",
    body: { name, owner: "test_user", ...extra }
  });
}

describe("workspace API", () => {
  before(() => {
    dataDir = mkdtempSync(join(tmpdir(), "hermest-workspace-api-"));
    process.env.HERMEST_DATA_DIR = dataDir;
    delete process.env.HERMEST_WORKSPACE_DB;
    delete process.env.VERCEL;
  });

  after(() => {
    if (originalEnv.dataDir === undefined) delete process.env.HERMEST_DATA_DIR;
    else process.env.HERMEST_DATA_DIR = originalEnv.dataDir;
    if (originalEnv.workspaceDb === undefined) delete process.env.HERMEST_WORKSPACE_DB;
    else process.env.HERMEST_WORKSPACE_DB = originalEnv.workspaceDb;
    if (originalEnv.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalEnv.vercel;
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it("persists a client across separate requests (default storage is durable)", async () => {
    const { status: created, data: createdData } = await createClient("Persistence Client", { tags: ["smoke"] });
    assert.equal(created, 201);
    const clientId = createdData.client.id;

    const { status, data } = await callApi(`workspace/clients/${clientId}`);
    assert.equal(status, 200, "a client created by one request must be readable by the next one");
    assert.equal(data.client.name, "Persistence Client");
  });

  it("create client → project → campaign → content_item → activity", async () => {
    const { status: s1, data: d1 } = await createClient("Smoke Client", { tags: ["smoke"] });
    assert.equal(s1, 201);
    assert.ok(d1.client.id);
    const clientId = d1.client.id;

    const { status: s2, data: d2 } = await callApi("workspace/projects", {
      method: "POST",
      body: { name: "Smoke Project", client_id: clientId, owner: "test_user", tags: ["smoke"] }
    });
    assert.equal(s2, 201);
    assert.ok(d2.project.id);
    const projectId = d2.project.id;

    const { status: s3, data: d3 } = await callApi("workspace/campaigns", {
      method: "POST",
      body: { name: "Smoke Campaign", project_id: projectId, owner: "test_user", tags: ["smoke"] }
    });
    assert.equal(s3, 201);
    assert.ok(d3.campaign.id);
    const campaignId = d3.campaign.id;

    const { status: s4, data: d4 } = await callApi("workspace/content", {
      method: "POST",
      body: { name: "Smoke Content", campaign_id: campaignId, type: "video", owner: "test_user", tags: ["smoke"] }
    });
    assert.equal(s4, 201);
    assert.ok(d4.content_item.id);

    const { status: s5, data: d5 } = await callApi("workspace/activity", { query: { limit: "10" } });
    assert.equal(s5, 200);
    assert.ok(d5.activity.length >= 4, `expected at least 4 activity rows, got ${d5.activity.length}`);
    assert.ok(d5.activity.some(entry => entry.action === "created" && entry.entity_type === "client"));
  });

  it("lists clients with filters", async () => {
    await createClient("Filterable Client", { status: "active" });

    const { status, data } = await callApi("workspace/clients", {
      query: { status: "active", limit: "10" }
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(data.clients));
    assert.ok(data.clients.length >= 1);
    assert.ok(data.clients.every(client => client.status === "active"));
  });

  it("updates a client", async () => {
    const { data: created } = await createClient("Update Client");
    const clientId = created.client.id;

    const { status, data } = await callApi(`workspace/clients/${clientId}`, {
      method: "PATCH",
      body: { name: "Updated Client", status: "archived" }
    });
    assert.equal(status, 200);
    assert.equal(data.client.name, "Updated Client");
    assert.equal(data.client.status, "archived");
  });

  it("deletes a client (projects survive with a detached client_id)", async () => {
    const { data: created } = await createClient("Delete Client");
    const clientId = created.client.id;

    const { data: projectData } = await callApi("workspace/projects", {
      method: "POST",
      body: { name: "Delete Project", client_id: clientId, owner: "test_user" }
    });
    const projectId = projectData.project.id;

    const { status: deleted } = await callApi(`workspace/clients/${clientId}`, { method: "DELETE" });
    assert.equal(deleted, 200);

    const { status, data } = await callApi(`workspace/projects/${projectId}`);
    assert.equal(status, 200);
    assert.equal(data.project.client_id, null);
  });

  it("exports and re-imports the workspace idempotently", async () => {
    await createClient("Export Client");

    const { status: exported, data: exportData } = await callApi("workspace/export", { method: "POST" });
    assert.equal(exported, 200);
    assert.equal(exportData.export.version, 1);
    assert.ok(Array.isArray(exportData.export.clients));
    assert.ok(exportData.export.clients.length >= 1, "export must contain persisted clients");

    const { status: imported, data: importData } = await callApi("workspace/import", {
      method: "POST",
      body: exportData.export
    });
    assert.equal(imported, 200);
    assert.equal(typeof importData.imported.clients, "number");

    const { data: afterImport } = await callApi("workspace/clients", { query: { limit: "100" } });
    const ids = afterImport.clients.map(client => client.id);
    assert.equal(new Set(ids).size, ids.length, "re-import must not duplicate clients");
  });
});
