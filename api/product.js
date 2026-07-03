import { getAuthStatus, requireReadAccess, requireWriteAccess } from "./_lib/auth.js";
import { buildAgentPlan } from "./_lib/agent-plan.js";
import { handleApiError, readJson, requireMethods, sendJson } from "./_lib/http.js";
import { createProjectRecord, summarizeProject, updateProjectRecord } from "./_lib/projects.js";
import { getProductReadiness } from "./_lib/readiness.js";
import {
  appendAudit,
  createId,
  deleteRecord,
  getRecord,
  getStorageStatus,
  listRecords,
  saveRecord
} from "./_lib/storage.js";

const JOB_STATUSES = new Set([
  "queued",
  "running",
  "waiting_for_approval",
  "blocked",
  "failed",
  "completed",
  "cancelled"
]);
const ASSET_RIGHTS_STATUSES = new Set(["unknown", "allowed", "restricted", "owned", "generated"]);

export default async function handler(request, response) {
  try {
    const path = routeParts(request);

    if (path[0] === "storage" && path[1] === "status") {
      if (!requireMethods(request, response, ["GET"])) return;
      sendJson(response, 200, {
        ...getStorageStatus(),
        auth: getAuthStatus()
      });
      return;
    }

    if (path[0] === "preflight" && !path[1]) {
      if (!requireMethods(request, response, ["GET"])) return;
      sendJson(response, 200, getProductReadiness());
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
      requireReadAccess(request);
      const audit = await listRecords("audit");
      sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), audit: audit.slice(0, 100) });
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
    requireReadAccess(request);
    const projects = await listRecords("projects");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), projects: projects.map(summarizeProject) });
    return;
  }

  const actor = requireWriteAccess(request);
  const body = await readJson(request);
  const record = createProjectRecord(body);
  await saveRecord("projects", record);
  await appendAudit("project.created", { id: record.id, title: record.title }, actor);
  sendJson(response, 201, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), project: record });
}

async function handleProjectById(request, response, id) {
  if (!requireMethods(request, response, ["GET", "PUT", "PATCH", "DELETE"])) return;

  if (request.method === "GET") {
    requireReadAccess(request);
    const existing = await getRecord("projects", id);
    if (!existing) {
      sendJson(response, 404, { ok: false, error: "project_not_found", id });
      return;
    }
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), project: existing });
    return;
  }

  const actor = requireWriteAccess(request);
  const existing = await getRecord("projects", id);

  if (!existing) {
    sendJson(response, 404, { ok: false, error: "project_not_found", id });
    return;
  }

  if (request.method === "DELETE") {
    await deleteRecord("projects", id);
    await appendAudit("project.deleted", { id }, actor);
    sendJson(response, 200, { ok: true, id });
    return;
  }

  const body = await readJson(request);
  const record = updateProjectRecord(existing, body);
  await saveRecord("projects", record);
  await appendAudit("project.updated", { id: record.id, title: record.title }, actor);
  sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), project: record });
}

async function handleAssetsIndex(request, response) {
  if (!requireMethods(request, response, ["GET", "POST"])) return;

  if (request.method === "GET") {
    requireReadAccess(request);
    const assets = await listRecords("assets");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), assets });
    return;
  }

  const actor = requireWriteAccess(request);
  const body = await readJson(request);
  const now = new Date().toISOString();
  const asset = {
    id: createId("asset"),
    projectId: safeText(body.projectId, 120),
    type: safeText(body.type || "reference", 80),
    source: safeText(body.source || "manual", 120),
    title: safeText(body.title || "Untitled asset", 200),
    url: safeText(body.url, 2000),
    rightsStatus: normalizeAssetRightsStatus(body.rightsStatus),
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    createdAt: now,
    updatedAt: now
  };
  await saveRecord("assets", asset);
  await appendAudit("asset.created", { id: asset.id, projectId: asset.projectId, rightsStatus: asset.rightsStatus }, actor);
  sendJson(response, 201, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), asset });
}

async function handleJobsIndex(request, response) {
  if (!requireMethods(request, response, ["GET", "POST"])) return;

  if (request.method === "GET") {
    requireReadAccess(request);
    const jobs = await listRecords("jobs");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), jobs });
    return;
  }

  const actor = requireWriteAccess(request);
  const body = await readJson(request);
  const now = new Date().toISOString();
  const plan = buildAgentPlan(body.publishPack || body.pack || {});
  const job = {
    id: createId("job"),
    projectId: String(body.projectId || ""),
    type: String(body.type || "publish_plan"),
    status: jobStatusFromPlan(plan),
    plan,
    createdAt: now,
    updatedAt: now
  };
  await saveRecord("jobs", job);
  await appendAudit("job.created", { id: job.id, type: job.type, status: job.status }, actor);
  sendJson(response, 201, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), job });
}

async function handleJobById(request, response, id) {
  if (!requireMethods(request, response, ["GET", "PATCH"])) return;

  if (request.method === "GET") {
    requireReadAccess(request);
    const existing = await getRecord("jobs", id);
    if (!existing) {
      sendJson(response, 404, { ok: false, error: "job_not_found", id });
      return;
    }
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), job: existing });
    return;
  }

  const actor = requireWriteAccess(request);
  const existing = await getRecord("jobs", id);

  if (!existing) {
    sendJson(response, 404, { ok: false, error: "job_not_found", id });
    return;
  }

  const body = await readJson(request);
  const job = {
    ...existing,
    status: normalizeJobStatus(body.status, existing.status),
    note: body.note ? String(body.note).slice(0, 4000) : existing.note,
    updatedAt: new Date().toISOString()
  };
  await saveRecord("jobs", job);
  await appendAudit("job.updated", { id: job.id, status: job.status }, actor);
  sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), job });
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

function jobStatusFromPlan(plan) {
  return plan.blockers.length ? "blocked" : "waiting_for_approval";
}

function normalizeJobStatus(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const status = String(value).trim();
  if (JOB_STATUSES.has(status)) return status;

  const error = new Error("invalid_job_status");
  error.status = 400;
  error.code = "invalid_job_status";
  error.note = `Job status must be one of: ${[...JOB_STATUSES].join(", ")}.`;
  throw error;
}

function normalizeAssetRightsStatus(value) {
  const status = String(value || "unknown").trim() || "unknown";
  if (ASSET_RIGHTS_STATUSES.has(status)) return status;

  const error = new Error("invalid_asset_rights_status");
  error.status = 400;
  error.code = "invalid_asset_rights_status";
  error.note = `Asset rightsStatus must be one of: ${[...ASSET_RIGHTS_STATUSES].join(", ")}.`;
  throw error;
}
