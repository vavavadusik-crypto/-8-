import { getAuthStatus, getRequestActor, requireOwnerToken, requireReadAccess, requireWriteAccess } from "./_lib/auth.js";
import { filterRecordsForActor, requireRecordAccess } from "./_lib/authorization.js";
import { buildAgentPlan } from "./_lib/agent-plan.js";
import { handleApiError, readJson, requireMethods, sendJson } from "./_lib/http.js";
import { createProjectRecord, summarizeProject, updateProjectRecord } from "./_lib/projects.js";
import { getProductReadiness } from "./_lib/readiness.js";
import { createSignedSessionToken } from "./_lib/session.js";
import { encryptSecret, redactConnector, requireTokenVault, sanitizeConnectorMetadata } from "./_lib/token-vault.js";
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
const CONNECTOR_PROVIDERS = new Set(["youtube", "tiktok", "instagram"]);
const CONNECTOR_STATUSES = new Set(["connected", "expired", "revoked", "error"]);

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

    if (path[0] === "session" && path[1] === "current") {
      if (!requireMethods(request, response, ["GET"])) return;
      const actor = getRequestActor(request);
      const auth = getAuthStatus();
      sendJson(response, 200, {
        ok: true,
        auth,
        actor,
        session: {
          signedSessionVerifierImplemented: auth.session.verifierImplemented,
          signedSessionIssuerImplemented: auth.session.issuerImplemented,
          ownerTokenBootstrapIssuerAvailable: auth.session.ownerTokenBootstrapIssuerAvailable,
          realUserAuthImplemented: false,
          authenticated: actor.authenticated,
          mode: actor.mode,
          note: "Bootstrap actor only. Replace with signed per-user sessions before production writes."
        }
      });
      return;
    }

    if (path[0] === "session" && path[1] === "bootstrap") {
      await handleSessionBootstrap(request, response);
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

    if (path[0] === "connectors" && !path[1]) {
      await handleConnectorsIndex(request, response);
      return;
    }

    if (path[0] === "connectors" && path[1]) {
      await handleConnectorById(request, response, path[1]);
      return;
    }

    if (path[0] === "audit" && !path[1]) {
      if (!requireMethods(request, response, ["GET"])) return;
      const actor = requireReadAccess(request);
      const audit = await listRecords("audit");
      sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), audit: filterRecordsForActor(audit, actor).slice(0, 100) });
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

async function handleSessionBootstrap(request, response) {
  if (!requireMethods(request, response, ["POST"])) return;

  const owner = requireOwnerToken(request);
  const auth = getAuthStatus();
  if (!auth.session.secretConfigured) {
    const error = new Error("session_secret_not_configured");
    error.status = 501;
    error.code = "session_secret_not_configured";
    error.note = "Set HERMEST_SESSION_SECRET before issuing bootstrap signed session tokens.";
    throw error;
  }

  const body = await readJson(request);
  const sub = safeSessionId(body.sub || body.userId, "user_bootstrap");
  const workspaceId = safeSessionId(body.workspaceId, "workspace_bootstrap");
  const ttlSeconds = clampTtlSeconds(body.ttlSeconds);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const token = createSignedSessionToken({ sub, workspaceId, iat: now, exp });

  await appendAudit("session.bootstrap_issued", {
    workspaceId,
    ownerUserId: sub,
    ttlSeconds,
    expiresAt: new Date(exp * 1000).toISOString()
  }, owner);

  sendJson(response, 201, {
    ok: true,
    auth,
    tokenType: "Bearer",
    token,
    actor: {
      authenticated: true,
      id: sub,
      workspaceId,
      mode: "signed-session"
    },
    expiresAt: new Date(exp * 1000).toISOString(),
    note: "Owner-token bootstrap token. Do not expose it in browser bundles or public logs."
  });
}

async function handleProjectsIndex(request, response) {
  if (!requireMethods(request, response, ["GET", "POST"])) return;

  if (request.method === "GET") {
    const actor = requireReadAccess(request);
    const projects = await listRecords("projects");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), projects: filterRecordsForActor(projects, actor).map(summarizeProject) });
    return;
  }

  const actor = requireWriteAccess(request);
  const body = await readJson(request);
  const record = createProjectRecord(body, actor);
  await saveRecord("projects", record);
  await appendAudit("project.created", { id: record.id, title: record.title, workspaceId: record.workspaceId, ownerUserId: record.ownerUserId }, actor);
  sendJson(response, 201, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), project: record });
}

async function handleProjectById(request, response, id) {
  if (!requireMethods(request, response, ["GET", "PUT", "PATCH", "DELETE"])) return;

  if (request.method === "GET") {
    const actor = requireReadAccess(request);
    const existing = await getRecord("projects", id);
    if (!existing) {
      sendJson(response, 404, { ok: false, error: "project_not_found", id });
      return;
    }
    requireRecordAccess(existing, actor, "read");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), project: existing });
    return;
  }

  const actor = requireWriteAccess(request);
  const existing = await getRecord("projects", id);

  if (!existing) {
    sendJson(response, 404, { ok: false, error: "project_not_found", id });
    return;
  }
  requireRecordAccess(existing, actor, request.method.toLowerCase());

  if (request.method === "DELETE") {
    await deleteRecord("projects", id);
    await appendAudit("project.deleted", { id }, actor);
    sendJson(response, 200, { ok: true, id });
    return;
  }

  const body = await readJson(request);
  const record = updateProjectRecord(existing, body, actor);
  await saveRecord("projects", record);
  await appendAudit("project.updated", { id: record.id, title: record.title, workspaceId: record.workspaceId, ownerUserId: record.ownerUserId }, actor);
  sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), project: record });
}

async function handleAssetsIndex(request, response) {
  if (!requireMethods(request, response, ["GET", "POST"])) return;

  if (request.method === "GET") {
    const actor = requireReadAccess(request);
    const assets = await listRecords("assets");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), assets: filterRecordsForActor(assets, actor) });
    return;
  }

  const actor = requireWriteAccess(request);
  const body = await readJson(request);
  const now = new Date().toISOString();
  const ownership = await childRecordOwnership(body.projectId, actor, "attach asset to");
  const asset = {
    id: createId("asset"),
    projectId: ownership.projectId,
    workspaceId: ownership.workspaceId,
    ownerUserId: ownership.ownerUserId,
    type: safeText(body.type || "reference", 80),
    source: safeText(body.source || "manual", 120),
    title: safeText(body.title || "Untitled asset", 200),
    url: safeText(body.url, 2000),
    rightsStatus: normalizeAssetRightsStatus(body.rightsStatus),
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    createdBy: ownership.actor,
    updatedBy: ownership.actor,
    createdAt: now,
    updatedAt: now
  };
  await saveRecord("assets", asset);
  await appendAudit("asset.created", { id: asset.id, projectId: asset.projectId, workspaceId: asset.workspaceId, ownerUserId: asset.ownerUserId, rightsStatus: asset.rightsStatus }, actor);
  sendJson(response, 201, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), asset });
}

async function handleJobsIndex(request, response) {
  if (!requireMethods(request, response, ["GET", "POST"])) return;

  if (request.method === "GET") {
    const actor = requireReadAccess(request);
    const jobs = await listRecords("jobs");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), jobs: filterRecordsForActor(jobs, actor) });
    return;
  }

  const actor = requireWriteAccess(request);
  const body = await readJson(request);
  const now = new Date().toISOString();
  const plan = buildAgentPlan(body.publishPack || body.pack || {});
  const ownership = await childRecordOwnership(body.projectId, actor, "create job for");
  const job = {
    id: createId("job"),
    projectId: ownership.projectId,
    workspaceId: ownership.workspaceId,
    ownerUserId: ownership.ownerUserId,
    type: String(body.type || "publish_plan"),
    status: jobStatusFromPlan(plan),
    plan,
    createdBy: ownership.actor,
    updatedBy: ownership.actor,
    createdAt: now,
    updatedAt: now
  };
  await saveRecord("jobs", job);
  await appendAudit("job.created", { id: job.id, projectId: job.projectId, workspaceId: job.workspaceId, ownerUserId: job.ownerUserId, type: job.type, status: job.status }, actor);
  sendJson(response, 201, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), job });
}

async function handleJobById(request, response, id) {
  if (!requireMethods(request, response, ["GET", "PATCH"])) return;

  if (request.method === "GET") {
    const actor = requireReadAccess(request);
    const existing = await getRecord("jobs", id);
    if (!existing) {
      sendJson(response, 404, { ok: false, error: "job_not_found", id });
      return;
    }
    requireRecordAccess(existing, actor, "read");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), job: existing });
    return;
  }

  const actor = requireWriteAccess(request);
  const existing = await getRecord("jobs", id);

  if (!existing) {
    sendJson(response, 404, { ok: false, error: "job_not_found", id });
    return;
  }
  requireRecordAccess(existing, actor, "patch");

  const body = await readJson(request);
  const job = {
    ...existing,
    status: normalizeJobStatus(body.status, existing.status),
    note: body.note ? String(body.note).slice(0, 4000) : existing.note,
    updatedBy: actorSnapshot(actor),
    updatedAt: new Date().toISOString()
  };
  await saveRecord("jobs", job);
  await appendAudit("job.updated", { id: job.id, workspaceId: job.workspaceId, ownerUserId: job.ownerUserId, status: job.status }, actor);
  sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), job });
}

async function handleConnectorsIndex(request, response) {
  if (!requireMethods(request, response, ["GET", "POST"])) return;

  if (request.method === "GET") {
    const actor = requireReadAccess(request);
    const connectors = await listRecords("connectors");
    sendJson(response, 200, {
      ok: true,
      storage: getStorageStatus(),
      auth: getAuthStatus(),
      connectors: filterRecordsForActor(connectors, actor).map(redactConnector)
    });
    return;
  }

  const actor = requireWriteAccess(request);
  requireTokenVault();
  const body = await readJson(request);
  const now = new Date().toISOString();
  const provider = normalizeConnectorProvider(body.provider);
  const accessToken = safeText(body.accessToken, 20_000);
  const refreshToken = safeText(body.refreshToken, 20_000);
  if (!accessToken && !refreshToken) {
    const error = new Error("connector_token_missing");
    error.status = 400;
    error.code = "connector_token_missing";
    error.note = "Connector storage requires an accessToken or refreshToken and will encrypt it server-side.";
    throw error;
  }

  const ownership = connectorOwnership(actor);
  const encryptedAccessToken = encryptSecret(accessToken);
  const encryptedRefreshToken = encryptSecret(refreshToken);
  const connector = {
    id: createId("conn"),
    workspaceId: ownership.workspaceId,
    ownerUserId: ownership.ownerUserId,
    provider,
    accountLabel: safeText(body.accountLabel || provider, 160),
    scopes: normalizeStringList(body.scopes, 32, 160),
    status: normalizeConnectorStatus(body.status, "connected"),
    tokenExpiresAt: normalizeIsoDate(body.tokenExpiresAt),
    encryptedAccessToken,
    encryptedRefreshToken,
    tokenKeyId: encryptedAccessToken?.kid || encryptedRefreshToken?.kid || "",
    metadata: sanitizeConnectorMetadata(body.metadata),
    createdBy: ownership.actor,
    updatedBy: ownership.actor,
    createdAt: now,
    updatedAt: now
  };

  await saveRecord("connectors", connector);
  await appendAudit("connector.created", {
    id: connector.id,
    workspaceId: connector.workspaceId,
    ownerUserId: connector.ownerUserId,
    provider: connector.provider,
    accessTokenStored: Boolean(connector.encryptedAccessToken),
    refreshTokenStored: Boolean(connector.encryptedRefreshToken)
  }, actor);

  sendJson(response, 201, {
    ok: true,
    storage: getStorageStatus(),
    auth: getAuthStatus(),
    connector: redactConnector(connector)
  });
}

async function handleConnectorById(request, response, id) {
  if (!requireMethods(request, response, ["GET", "DELETE"])) return;

  if (request.method === "GET") {
    const actor = requireReadAccess(request);
    const existing = await getRecord("connectors", id);
    if (!existing) {
      sendJson(response, 404, { ok: false, error: "connector_not_found", id });
      return;
    }
    requireRecordAccess(existing, actor, "read");
    sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), connector: redactConnector(existing) });
    return;
  }

  const actor = requireWriteAccess(request);
  const existing = await getRecord("connectors", id);
  if (!existing) {
    sendJson(response, 404, { ok: false, error: "connector_not_found", id });
    return;
  }
  requireRecordAccess(existing, actor, "delete");
  await deleteRecord("connectors", id);
  await appendAudit("connector.deleted", {
    id,
    workspaceId: existing.workspaceId,
    ownerUserId: existing.ownerUserId,
    provider: existing.provider
  }, actor);
  sendJson(response, 200, { ok: true, id });
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

function safeSessionId(value, fallback) {
  const id = safeText(value, 120).trim();
  return /^[a-z0-9_-]{2,120}$/i.test(id) ? id : fallback;
}

function clampTtlSeconds(value) {
  const ttl = Number(value || 3600);
  if (!Number.isFinite(ttl)) return 3600;
  return Math.max(60, Math.min(Math.floor(ttl), 86_400));
}

function connectorOwnership(actor) {
  return {
    workspaceId: safeText(defaultWorkspaceId(actor), 120),
    ownerUserId: safeText(defaultOwnerUserId(actor), 120),
    actor: actorSnapshot(actor)
  };
}

async function childRecordOwnership(projectIdInput, actor, action) {
  const projectId = safeText(projectIdInput, 120);
  const project = isStorageSafeId(projectId) ? await getRecord("projects", projectId) : null;
  if (project) requireRecordAccess(project, actor, action);

  return {
    projectId,
    workspaceId: safeText(project?.workspaceId || project?.project?.workspaceId || defaultWorkspaceId(actor), 120),
    ownerUserId: safeText(project?.ownerUserId || project?.project?.ownerUserId || defaultOwnerUserId(actor), 120),
    actor: actorSnapshot(actor)
  };
}

function normalizeConnectorProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (CONNECTOR_PROVIDERS.has(provider)) return provider;

  const error = new Error("invalid_connector_provider");
  error.status = 400;
  error.code = "invalid_connector_provider";
  error.note = `Connector provider must be one of: ${[...CONNECTOR_PROVIDERS].join(", ")}.`;
  throw error;
}

function normalizeConnectorStatus(value, fallback) {
  const status = String(value || fallback).trim().toLowerCase();
  if (CONNECTOR_STATUSES.has(status)) return status;

  const error = new Error("invalid_connector_status");
  error.status = 400;
  error.code = "invalid_connector_status";
  error.note = `Connector status must be one of: ${[...CONNECTOR_STATUSES].join(", ")}.`;
  throw error;
}

function normalizeStringList(value, limit, itemLimit) {
  const items = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,\s]+/)
      .filter(Boolean);
  return items.slice(0, limit).map(item => safeText(item, itemLimit).trim()).filter(Boolean);
}

function normalizeIsoDate(value) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function defaultWorkspaceId(actor) {
  if (actor?.workspaceId) return actor.workspaceId;
  if (actor?.mode === "owner-token") return "workspace_owner";
  return "workspace_local";
}

function defaultOwnerUserId(actor) {
  return actor?.id || "local-dev";
}

function actorSnapshot(actor) {
  if (!actor) {
    return {
      id: "unknown",
      mode: "unknown",
      authenticated: false
    };
  }

  return {
    id: safeText(actor.id || "unknown", 120),
    mode: safeText(actor.mode || "unknown", 80),
    authenticated: Boolean(actor.authenticated)
  };
}

function isStorageSafeId(id) {
  return /^[a-z0-9_-]{3,120}$/i.test(String(id || ""));
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
