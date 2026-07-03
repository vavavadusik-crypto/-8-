import { buildAgentPlan } from "./_lib/agent-plan.js";
import { handleApiError, readJson, requireMethods, sendJson } from "./_lib/http.js";
import { createProjectRecord, summarizeProject, updateProjectRecord } from "./_lib/projects.js";
import {
  appendAudit,
  createId,
  deleteRecord,
  getRecord,
  getStorageStatus,
  listRecords,
  saveRecord
} from "./_lib/storage.js";

export default async function handler(request, response) {
  try {
    const path = routeParts(request);

    if (path[0] === "storage" && path[1] === "status") {
      if (!requireMethods(request, response, ["GET"])) return;
      sendJson(response, 200, getStorageStatus());
      return;
    }

    if (path[0] === "projects" && !path[1]) {
      await handleProjectsIndex(request, response);
      return;
    }

    if (path[0] === "projects" && path[1]) {
      await handleProjectById(request, response, path[1]);
      return;
    }

    if (path[0] === "assets" && !path[1]) {
      await handleAssetsIndex(request, response);
      return;
    }

    if (path[0] === "jobs" && !path[1]) {
      await handleJobsIndex(request, response);
      return;
    }

    if (path[0] === "jobs" && path[1]) {
      await handleJobById(request, response, path[1]);
      return;
    }

    if (path[0] === "audit" && !path[1]) {
      if (!requireMethods(request, response, ["GET"])) return;
      const audit = await listRecords("audit");
      sendJson(response, 200, { ok: true, storage: getStorageStatus(), audit: audit.slice(0, 100) });
      return;
    }

    if (path[0] === "agent" && path[1] === "plan") {
      if (!requireMethods(request, response, ["POST"])) return;
      const body = await readJson(request);
      sendJson(response, 200, buildAgentPlan(body.publishPack || body.pack || body));
      return;
    }

    sendJson(response, 404, {
      ok: false,
      error: "product_route_not_found",
      path: path.join("/")
    });
  } catch (error) {
    handleApiError(response, error);
  }
}

async function handleProjectsIndex(request, response) {
  if (!requireMethods(request, response, ["GET", "POST"])) return;

  if (request.method === "GET") {
    const projects = await listRecords("projects");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), projects: projects.map(summarizeProject) });
    return;
  }

  const body = await readJson(request);
  const record = createProjectRecord(body);
  await saveRecord("projects", record);
  await appendAudit("project.created", { id: record.id, title: record.title });
  sendJson(response, 201, { ok: true, storage: getStorageStatus(), project: record });
}

async function handleProjectById(request, response, id) {
  if (!requireMethods(request, response, ["GET", "PUT", "PATCH", "DELETE"])) return;
  const existing = await getRecord("projects", id);

  if (!existing) {
    sendJson(response, 404, { ok: false, error: "project_not_found", id });
    return;
  }

  if (request.method === "GET") {
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), project: existing });
    return;
  }

  if (request.method === "DELETE") {
    await deleteRecord("projects", id);
    await appendAudit("project.deleted", { id });
    sendJson(response, 200, { ok: true, id });
    return;
  }

  const body = await readJson(request);
  const record = updateProjectRecord(existing, body);
  await saveRecord("projects", record);
  await appendAudit("project.updated", { id: record.id, title: record.title });
  sendJson(response, 200, { ok: true, storage: getStorageStatus(), project: record });
}

async function handleAssetsIndex(request, response) {
  if (!requireMethods(request, response, ["GET", "POST"])) return;

  if (request.method === "GET") {
    const assets = await listRecords("assets");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), assets });
    return;
  }

  const body = await readJson(request);
  const now = new Date().toISOString();
  const asset = {
    id: createId("asset"),
    projectId: safeText(body.projectId, 120),
    type: safeText(body.type || "reference", 80),
    source: safeText(body.source || "manual", 120),
    title: safeText(body.title || "Untitled asset", 200),
    url: safeText(body.url, 2000),
    rightsStatus: safeText(body.rightsStatus || "unknown", 80),
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    createdAt: now,
    updatedAt: now
  };
  await saveRecord("assets", asset);
  await appendAudit("asset.created", { id: asset.id, projectId: asset.projectId, rightsStatus: asset.rightsStatus });
  sendJson(response, 201, { ok: true, storage: getStorageStatus(), asset });
}

async function handleJobsIndex(request, response) {
  if (!requireMethods(request, response, ["GET", "POST"])) return;

  if (request.method === "GET") {
    const jobs = await listRecords("jobs");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), jobs });
    return;
  }

  const body = await readJson(request);
  const now = new Date().toISOString();
  const plan = buildAgentPlan(body.publishPack || body.pack || {});
  const job = {
    id: createId("job"),
    projectId: String(body.projectId || ""),
    type: String(body.type || "publish_plan"),
    status: plan.blockers.length ? "blocked" : "ready_for_approval",
    plan,
    createdAt: now,
    updatedAt: now
  };
  await saveRecord("jobs", job);
  await appendAudit("job.created", { id: job.id, type: job.type, status: job.status });
  sendJson(response, 201, { ok: true, storage: getStorageStatus(), job });
}

async function handleJobById(request, response, id) {
  if (!requireMethods(request, response, ["GET", "PATCH"])) return;
  const existing = await getRecord("jobs", id);

  if (!existing) {
    sendJson(response, 404, { ok: false, error: "job_not_found", id });
    return;
  }

  if (request.method === "GET") {
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), job: existing });
    return;
  }

  const body = await readJson(request);
  const job = {
    ...existing,
    status: String(body.status || existing.status),
    note: body.note ? String(body.note).slice(0, 4000) : existing.note,
    updatedAt: new Date().toISOString()
  };
  await saveRecord("jobs", job);
  await appendAudit("job.updated", { id: job.id, status: job.status });
  sendJson(response, 200, { ok: true, storage: getStorageStatus(), job });
}

function routeParts(request) {
  const route = request.query?.route || routeFromUrl(request.url) || "";
  return String(Array.isArray(route) ? route[0] : route).split("/").filter(Boolean);
}

function routeFromUrl(value = "") {
  const query = String(value).split("?")[1] || "";
  const params = new URLSearchParams(query);
  return params.get("route") || "";
}

function safeText(value, limit) {
  return String(value || "").slice(0, limit);
}
