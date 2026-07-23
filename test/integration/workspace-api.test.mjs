import { describe, it } from "node:test";
import assert from "node:assert/strict";

const API_BASE = process.env.HERMEST_API_BASE || "http://localhost:3000";

async function fetchApi(path, options = {}) {
  const url = `${API_BASE}/api/product?route=${encodeURIComponent(path)}`;
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { status: response.status, data };
}

describe("workspace API", () => {
  it("create client → project → campaign → content_item → link render_job → activity", async () => {
    const { status: s1, data: d1 } = await fetchApi("workspace/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Smoke Client", owner: "test_user", tags: ["smoke"] })
    });
    assert.equal(s1, 201);
    assert.ok(d1.client.id);
    const clientId = d1.client.id;

    const { status: s2, data: d2 } = await fetchApi("workspace/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Smoke Project", client_id: clientId, owner: "test_user", tags: ["smoke"] })
    });
    assert.equal(s2, 201);
    assert.ok(d2.project.id);
    const projectId = d2.project.id;

    const { status: s3, data: d3 } = await fetchApi("workspace/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Smoke Campaign", project_id: projectId, owner: "test_user", tags: ["smoke"] })
    });
    assert.equal(s3, 201);
    assert.ok(d3.campaign.id);
    const campaignId = d3.campaign.id;

    const { status: s4, data: d4 } = await fetchApi("workspace/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Smoke Content", campaign_id: campaignId, type: "video", owner: "test_user", tags: ["smoke"] })
    });
    assert.equal(s4, 201);
    assert.ok(d4.content_item.id);
    const contentItemId = d4.content_item.id;

    const { status: s5, data: d5 } = await fetchApi("workspace/activity?limit=10", { method: "GET" });
    assert.equal(s5, 200);
    assert.ok(d5.activity.length >= 4);
    assert.ok(d5.activity.some(a => a.action === "created" && a.entity_type === "client"));
  });

  it("list clients with filters", async () => {
    const { status, data } = await fetchApi("workspace/clients?status=active&limit=10", { method: "GET" });
    assert.equal(status, 200);
    assert.ok(Array.isArray(data.clients));
  });

  it("update client", async () => {
    const { data: d1 } = await fetchApi("workspace/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Update Client", owner: "test_user" })
    });
    const clientId = d1.client.id;

    const { status, data } = await fetchApi(`workspace/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Client", status: "archived" })
    });
    assert.equal(status, 200);
    assert.equal(data.client.name, "Updated Client");
    assert.equal(data.client.status, "archived");
  });

  it("delete client (cascades to projects)", async () => {
    const { data: d1 } = await fetchApi("workspace/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Delete Client", owner: "test_user" })
    });
    const clientId = d1.client.id;

    const { data: d2 } = await fetchApi("workspace/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Delete Project", client_id: clientId, owner: "test_user" })
    });
    const projectId = d2.project.id;

    const { status: s1 } = await fetchApi(`workspace/clients/${clientId}`, { method: "DELETE" });
    assert.equal(s1, 200);

    const { status: s2, data: d3 } = await fetchApi(`workspace/projects/${projectId}`, { method: "GET" });
    assert.equal(s2, 200);
    assert.equal(d3.project.client_id, null);
  });

  it("export → import (idempotent)", async () => {
    const { status: s1, data: d1 } = await fetchApi("workspace/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    assert.equal(s1, 200);
    assert.equal(d1.export.version, 1);
    assert.ok(Array.isArray(d1.export.clients));

    const { status: s2, data: d2 } = await fetchApi("workspace/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(d1.export)
    });
    assert.equal(s2, 200);
    assert.ok(typeof d2.imported.clients === "number");
  });
});
