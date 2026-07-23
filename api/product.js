import { createAccount, getAccountAuthStatus, verifyAccountCredentials } from "./_lib/accounts.js";
import { getAuthStatus, getRequestActor, requireOwnerToken, requireReadAccess, requireWriteAccess } from "./_lib/auth.js";
import { filterRecordsForActor, requireRecordAccess } from "./_lib/authorization.js";
import { buildAgentPlan } from "./_lib/agent-plan.js";
import { getConnectorCapabilityStatus } from "./_lib/connector-capabilities.js";
import { handleApiError, readJson, requireMethods, sendJson } from "./_lib/http.js";
import { createProjectRecord, summarizeProject, updateProjectRecord } from "./_lib/projects.js";
import { assertCandidateApproval, buildPublishCandidate, summarizeAssetRights } from "./_lib/publish-candidates.js";
import { getProductReadiness } from "./_lib/readiness.js";
import { createSignedSessionToken } from "./_lib/session.js";
import { encryptSecret, redactConnector, requireTokenVault, sanitizeConnectorMetadata } from "./_lib/token-vault.js";
import { getPlatformPublishingStatus, getPlatformStatus } from "../src/publishing/platform-status.js";
import {
  appendAudit,
  createId,
  deleteRecord,
  getRecord,
  getStorageStatus,
  listRecords,
  saveRecord
} from "./_lib/storage.js";
import { createWorkspaceStore } from "../src/workspace/workspace-store.js";

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
      const accountAuth = getAccountAuthStatus();
      sendJson(response, 200, {
        ok: true,
        auth,
        actor,
        accountAuth,
        session: {
          signedSessionVerifierImplemented: auth.session.verifierImplemented,
          signedSessionIssuerImplemented: auth.session.issuerImplemented,
          ownerTokenBootstrapIssuerAvailable: auth.session.ownerTokenBootstrapIssuerAvailable,
          realUserAuthImplemented: accountAuth.implemented,
          realUserAuthEnabled: accountAuth.enabled,
          realUserAuthReady: accountAuth.ready,
          authenticated: actor.authenticated,
          mode: actor.mode,
          note: accountAuth.ready
            ? "Account auth can issue signed httpOnly cookie sessions. Production writes still require durable storage and live verification."
            : "Bootstrap actor plus account-auth foundation. Enable account auth before public user sessions."
        }
      });
      return;
    }

    if (path[0] === "auth" && path[1] === "status") {
      await handleAuthStatus(request, response);
      return;
    }

    if (path[0] === "auth" && path[1] === "signup") {
      await handleAuthSignup(request, response);
      return;
    }

    if (path[0] === "auth" && path[1] === "login") {
      await handleAuthLogin(request, response);
      return;
    }

    if (path[0] === "auth" && path[1] === "logout") {
      await handleAuthLogout(request, response);
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

    if (path[0] === "publish-candidates" && !path[1]) {
      await handlePublishCandidatesIndex(request, response);
      return;
    }

    if (path[0] === "publish-candidates" && path[1]) {
      await handlePublishCandidateById(request, response, path[1]);
      return;
    }

    if (path[0] === "jobs" && !path[1]) {
      await handleJobsIndex(request, response);
      return;
    }

    if (path[0] === "jobs" && path[1] && path[2] === "approval") {
      await handleJobApproval(request, response, path[1]);
      return;
    }

    if (path[0] === "jobs" && path[1]) {
      await handleJobById(request, response, path[1]);
      return;
    }

    if (path[0] === "connectors" && path[1] === "capabilities" && !path[2]) {
      if (!requireMethods(request, response, ["GET"])) return;
      sendJson(response, 200, getConnectorCapabilityStatus({ env: process.env, runtime: "server" }));
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

    if (path[0] === "publishing" && path[1] === "platforms" && !path[2]) {
      if (!requireMethods(request, response, ["GET"])) return;
      sendJson(response, 200, getPlatformPublishingStatus());
      return;
    }

    if (path[0] === "publishing" && path[1] === "platforms" && path[2]) {
      if (!requireMethods(request, response, ["GET"])) return;
      const status = getPlatformStatus(path[2]);
      if (!status) {
        sendJson(response, 404, { ok: false, error: "platform_not_found", platform: path[2] });
        return;
      }
      sendJson(response, 200, { ok: true, platform: status });
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

    if (path[0] === "workspace") {
      await handleWorkspace(request, response, path.slice(1));
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

async function handleAuthStatus(request, response) {
  if (!requireMethods(request, response, ["GET"])) return;
  sendJson(response, 200, {
    ok: true,
    auth: getAuthStatus(),
    accountAuth: getAccountAuthStatus(),
    actor: getRequestActor(request)
  });
}

async function handleAuthSignup(request, response) {
  if (!requireMethods(request, response, ["POST"])) return;
  const body = await readJson(request);
  const account = await createAccount(body);
  const session = issueAccountSession(response, account, body.ttlSeconds);
  await appendAudit("account.created", {
    workspaceId: account.workspaceId,
    ownerUserId: account.id,
    email: account.email
  }, session.actor);
  sendJson(response, 201, {
    ok: true,
    account,
    actor: session.actor,
    expiresAt: session.expiresAt,
    tokenReturned: false,
    note: "Signed session was set as an httpOnly cookie."
  });
}

async function handleAuthLogin(request, response) {
  if (!requireMethods(request, response, ["POST"])) return;
  const body = await readJson(request);
  const account = await verifyAccountCredentials(body);
  const session = issueAccountSession(response, account, body.ttlSeconds);
  await appendAudit("account.login", {
    workspaceId: account.workspaceId,
    ownerUserId: account.id,
    email: account.email
  }, session.actor);
  sendJson(response, 200, {
    ok: true,
    account,
    actor: session.actor,
    expiresAt: session.expiresAt,
    tokenReturned: false,
    note: "Signed session was set as an httpOnly cookie."
  });
}

async function handleAuthLogout(request, response) {
  if (!requireMethods(request, response, ["POST"])) return;
  const actor = getRequestActor(request);
  clearSessionCookie(response);
  if (actor.authenticated) {
    await appendAudit("account.logout", {
      workspaceId: actor.workspaceId,
      ownerUserId: actor.id
    }, actor);
  }
  sendJson(response, 200, {
    ok: true,
    actor: {
      authenticated: false,
      id: "anonymous",
      mode: "signed-out"
    }
  });
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

function issueAccountSession(response, account, ttlSecondsInput) {
  const ttlSeconds = clampTtlSeconds(ttlSecondsInput || 86_400);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const token = createSignedSessionToken({
    sub: account.id,
    workspaceId: account.workspaceId,
    iat: now,
    exp
  });
  setSessionCookie(response, token, ttlSeconds);
  return {
    actor: {
      authenticated: true,
      id: account.id,
      workspaceId: account.workspaceId,
      mode: "signed-session"
    },
    expiresAt: new Date(exp * 1000).toISOString()
  };
}

function setSessionCookie(response, token, maxAge) {
  const secure = process.env.VERCEL ? "; Secure" : "";
  response.setHeader("Set-Cookie", `hermest_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
}

function clearSessionCookie(response) {
  const secure = process.env.VERCEL ? "; Secure" : "";
  response.setHeader("Set-Cookie", `hermest_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
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

async function handlePublishCandidatesIndex(request, response) {
  if (!requireMethods(request, response, ["GET", "POST"])) return;

  if (request.method === "GET") {
    const actor = requireReadAccess(request);
    const candidates = await listRecords("publishCandidates");
    sendJson(response, 200, {
      ok: true,
      storage: getStorageStatus(),
      auth: getAuthStatus(),
      candidates: filterRecordsForActor(candidates, actor)
    });
    return;
  }

  const actor = requireWriteAccess(request);
  const body = await readJson(request);
  const projectId = safeText(body.projectId, 120);
  const project = isStorageSafeId(projectId) ? await getRecord("projects", projectId) : null;
  if (!project) {
    const error = new Error("candidate_project_not_found");
    error.status = 404;
    error.code = "candidate_project_not_found";
    throw error;
  }
  requireRecordAccess(project, actor, "create publish candidate for");
  const visibleAssets = filterRecordsForActor(await listRecords("assets"), actor)
    .filter(asset => asset.projectId === project.id);
  const now = new Date().toISOString();
  const candidate = buildPublishCandidate({
    projectRecord: project,
    recipe: body.recipe,
    platforms: body.platforms || project.project?.publish?.platforms,
    artifacts: body.artifacts,
    manifestSha256: body.manifestSha256,
    rights: summarizeAssetRights(visibleAssets),
    evidence: {
      status: "metadata_only",
      verifier: "api-metadata-v1"
    },
    createdAt: now
  });
  const existing = await getRecord("publishCandidates", candidate.id);
  if (existing) {
    requireRecordAccess(existing, actor, "read publish candidate");
    if (existing.digest !== candidate.digest || existing.status !== "sealed") {
      throwProductError("publish_candidate_id_collision", 409);
    }
    sendJson(response, 200, {
      ok: true,
      created: false,
      storage: getStorageStatus(),
      auth: getAuthStatus(),
      candidate: existing
    });
    return;
  }
  const record = {
    ...candidate,
    createdBy: actorSnapshot(actor),
    updatedBy: actorSnapshot(actor)
  };
  await saveRecord("publishCandidates", record);
  await appendAudit("publish_candidate.sealed", {
    id: record.id,
    projectId: record.projectId,
    workspaceId: record.workspaceId,
    ownerUserId: record.ownerUserId,
    digest: record.digest,
    evidenceStatus: record.evidence.status,
    approvable: record.approvable
  }, actor);
  sendJson(response, 201, {
    ok: true,
    created: true,
    storage: getStorageStatus(),
    auth: getAuthStatus(),
    candidate: record
  });
}

async function handlePublishCandidateById(request, response, id) {
  if (!requireMethods(request, response, ["GET"])) return;
  const actor = requireReadAccess(request);
  const candidate = await getRecord("publishCandidates", id);
  if (!candidate) {
    sendJson(response, 404, { ok: false, error: "publish_candidate_not_found", id });
    return;
  }
  requireRecordAccess(candidate, actor, "read publish candidate");
  sendJson(response, 200, {
    ok: true,
    storage: getStorageStatus(),
    auth: getAuthStatus(),
    candidate
  });
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
  const ownership = await childRecordOwnership(body.projectId, actor, "create job for");
  const candidate = body.candidateId
    ? await loadCandidateBinding(body, ownership.projectId, actor)
    : null;
  const plan = buildAgentPlan(body.publishPack || body.pack || {});
  if (candidate) {
    plan.blockers = unique([
      ...plan.blockers,
      ...(candidate.approvalBlockers || []).map(blocker => `candidate_${blocker}`)
    ]);
    plan.status = plan.blockers.length ? "blocked_until_connectors_and_storage" : "ready_for_human_approval";
  }
  const job = {
    id: createId("job"),
    projectId: ownership.projectId,
    workspaceId: ownership.workspaceId,
    ownerUserId: ownership.ownerUserId,
    type: String(body.type || "publish_plan"),
    status: jobStatusFromPlan(plan),
    plan,
    candidate: candidate ? candidateReference(candidate) : null,
    approval: approvalStateFromPlan(plan),
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
    status: normalizeJobTransition(body.status, existing),
    note: body.note ? String(body.note).slice(0, 4000) : existing.note,
    updatedBy: actorSnapshot(actor),
    updatedAt: new Date().toISOString()
  };
  await saveRecord("jobs", job);
  await appendAudit("job.updated", { id: job.id, workspaceId: job.workspaceId, ownerUserId: job.ownerUserId, status: job.status }, actor);
  sendJson(response, 200, { ok: true, storage: getStorageStatus(), auth: getAuthStatus(), job });
}

async function handleJobApproval(request, response, id) {
  if (!requireMethods(request, response, ["POST"])) return;

  const actor = requireWriteAccess(request);
  const existing = await getRecord("jobs", id);
  if (!existing) {
    sendJson(response, 404, { ok: false, error: "job_not_found", id });
    return;
  }
  requireRecordAccess(existing, actor, "approve");

  const body = await readJson(request);
  const action = normalizeApprovalAction(body.action || body.decision);
  if (action === "approve" && existing.approval?.status === "blocked") {
    const error = new Error("job_approval_blocked");
    error.status = 409;
    error.code = "job_approval_blocked";
    error.note = "Resolve job plan blockers before approval.";
    throw error;
  }
  const candidate = action === "approve"
    ? await loadApprovalCandidate(existing, body, actor)
    : null;
  const now = new Date().toISOString();
  const actorRecord = actorSnapshot(actor);
  const approval = {
    required: true,
    status: action === "approve" ? "approved" : "rejected",
    candidate: candidate ? candidateReference(candidate) : existing.candidate || null,
    decidedAt: now,
    decidedBy: actorRecord,
    note: safeText(body.note, 4000)
  };
  const executionBlockers = action === "approve"
    ? [
        "durable_job_queue_not_implemented",
        "oauth_token_exchange_not_implemented",
        "provider_review_not_complete",
        "autopublishing_disabled"
      ]
    : [];
  const job = {
    ...existing,
    status: action === "approve" ? "blocked" : "cancelled",
    approval,
    execution: {
      status: action === "approve" ? "blocked_after_approval" : "rejected_by_human",
      blockers: executionBlockers,
      canAutopublish: false
    },
    updatedBy: actorRecord,
    updatedAt: now
  };

  await saveRecord("jobs", job);
  await appendAudit("job.approval_decided", {
    id: job.id,
    workspaceId: job.workspaceId,
    ownerUserId: job.ownerUserId,
    decision: approval.status,
    candidateId: approval.candidate?.id || "",
    candidateDigest: approval.candidate?.digest || "",
    executionBlockers
  }, actor);
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

async function loadCandidateBinding(body, projectId, actor) {
  const candidateId = safeText(body.candidateId, 120);
  const candidate = isStorageSafeId(candidateId)
    ? await getRecord("publishCandidates", candidateId)
    : null;
  if (!candidate) throwProductError("publish_candidate_not_found", 404);
  requireRecordAccess(candidate, actor, "bind publish candidate");
  if (candidate.projectId !== projectId) throwProductError("candidate_project_mismatch", 409);
  if (candidate.status !== "sealed") throwProductError("candidate_not_sealed", 409);
  if (String(body.candidateDigest || "") !== candidate.digest) {
    throwProductError("candidate_digest_mismatch", 409);
  }
  if (Number(body.candidateVersion) !== candidate.version) {
    throwProductError("candidate_version_mismatch", 409);
  }
  return candidate;
}

async function loadApprovalCandidate(job, body, actor) {
  const binding = job.candidate;
  if (!binding?.id || !binding.digest || !binding.version) {
    throwProductError("job_candidate_binding_required", 409);
  }
  if (body.candidateId !== binding.id || body.candidateDigest !== binding.digest || Number(body.candidateVersion) !== binding.version) {
    throwProductError("job_candidate_binding_mismatch", 409);
  }
  const candidate = await getRecord("publishCandidates", binding.id);
  if (!candidate) throwProductError("publish_candidate_not_found", 404);
  requireRecordAccess(candidate, actor, "approve publish candidate");
  if (candidate.projectId !== job.projectId || candidate.workspaceId !== job.workspaceId) {
    throwProductError("candidate_job_ownership_mismatch", 409);
  }
  assertCandidateApproval(candidate, body);
  return candidate;
}

function candidateReference(candidate) {
  return {
    id: candidate.id,
    digest: candidate.digest,
    version: candidate.version,
    status: candidate.status,
    evidenceStatus: candidate.evidence?.status || "unknown",
    approvable: Boolean(candidate.approvable)
  };
}

function throwProductError(code, status) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}

function unique(values) {
  return [...new Set(values)];
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

function approvalStateFromPlan(plan) {
  return {
    required: true,
    status: plan.blockers.length ? "blocked" : "pending",
    blockers: plan.blockers,
    canAutopublish: false
  };
}

function normalizeApprovalAction(value) {
  const action = String(value || "").trim().toLowerCase();
  if (action === "approve" || action === "approved") return "approve";
  if (action === "reject" || action === "rejected") return "reject";

  const error = new Error("invalid_approval_action");
  error.status = 400;
  error.code = "invalid_approval_action";
  error.note = "Approval action must be approve or reject.";
  throw error;
}

function normalizeJobTransition(value, existing) {
  const status = normalizeJobStatus(value, existing.status);
  if (status !== "running" && status !== "completed") return status;
  const blocked = existing.approval?.status !== "approved"
    || existing.execution?.canAutopublish === false
    || (existing.plan?.blockers || []).length > 0;
  if (blocked) throwProductError("job_execution_blocked", 409);
  return status;
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

async function handleWorkspace(request, response, path) {
  const store = createWorkspaceStore();

  try {
    if (path[0] === "clients" && !path[1]) {
      if (request.method === "GET") {
        const filters = {
          workspace_id: request.query?.workspace_id || "workspace_local",
          search: request.query?.search,
          status: request.query?.status,
          limit: parseInt(request.query?.limit || "50", 10),
          offset: parseInt(request.query?.offset || "0", 10)
        };
        const clients = store.listClients(filters);
        sendJson(response, 200, { ok: true, clients, total: clients.length });
        return;
      }
      if (request.method === "POST") {
        const body = await readJson(request);
        const client = store.createClient({ ...body, workspace_id: body.workspace_id || "workspace_local" });
        sendJson(response, 201, { ok: true, client });
        return;
      }
    }

    if (path[0] === "clients" && path[1]) {
      if (request.method === "GET") {
        const client = store.getClient(path[1]);
        if (!client) {
          sendJson(response, 404, { ok: false, error: "client_not_found", id: path[1] });
          return;
        }
        sendJson(response, 200, { ok: true, client });
        return;
      }
      if (request.method === "PATCH") {
        const body = await readJson(request);
        const client = store.updateClient(path[1], body);
        sendJson(response, 200, { ok: true, client });
        return;
      }
      if (request.method === "DELETE") {
        const result = store.deleteClient(path[1]);
        sendJson(response, 200, result);
        return;
      }
    }

    if (path[0] === "projects" && !path[1]) {
      if (request.method === "GET") {
        const filters = {
          workspace_id: request.query?.workspace_id || "workspace_local",
          client_id: request.query?.client_id,
          search: request.query?.search,
          status: request.query?.status,
          limit: parseInt(request.query?.limit || "50", 10),
          offset: parseInt(request.query?.offset || "0", 10)
        };
        const projects = store.listProjects(filters);
        sendJson(response, 200, { ok: true, projects, total: projects.length });
        return;
      }
      if (request.method === "POST") {
        const body = await readJson(request);
        const project = store.createProject({ ...body, workspace_id: body.workspace_id || "workspace_local" });
        sendJson(response, 201, { ok: true, project });
        return;
      }
    }

    if (path[0] === "projects" && path[1]) {
      if (request.method === "GET") {
        const project = store.getProject(path[1]);
        if (!project) {
          sendJson(response, 404, { ok: false, error: "project_not_found", id: path[1] });
          return;
        }
        sendJson(response, 200, { ok: true, project });
        return;
      }
      if (request.method === "PATCH") {
        const body = await readJson(request);
        const project = store.updateProject(path[1], body);
        sendJson(response, 200, { ok: true, project });
        return;
      }
      if (request.method === "DELETE") {
        const result = store.deleteProject(path[1]);
        sendJson(response, 200, result);
        return;
      }
    }

    if (path[0] === "campaigns" && !path[1]) {
      if (request.method === "GET") {
        const filters = {
          workspace_id: request.query?.workspace_id || "workspace_local",
          project_id: request.query?.project_id,
          search: request.query?.search,
          status: request.query?.status,
          limit: parseInt(request.query?.limit || "50", 10),
          offset: parseInt(request.query?.offset || "0", 10)
        };
        const campaigns = store.listCampaigns(filters);
        sendJson(response, 200, { ok: true, campaigns, total: campaigns.length });
        return;
      }
      if (request.method === "POST") {
        const body = await readJson(request);
        const campaign = store.createCampaign({ ...body, workspace_id: body.workspace_id || "workspace_local" });
        sendJson(response, 201, { ok: true, campaign });
        return;
      }
    }

    if (path[0] === "campaigns" && path[1] && path[2] === "content") {
      if (request.method === "GET") {
        const filters = {
          campaign_id: path[1],
          limit: parseInt(request.query?.limit || "50", 10),
          offset: parseInt(request.query?.offset || "0", 10)
        };
        const content_items = store.listContentItems(filters);
        sendJson(response, 200, { ok: true, content_items });
        return;
      }
    }

    if (path[0] === "campaigns" && path[1]) {
      if (request.method === "GET") {
        const campaign = store.getCampaign(path[1]);
        if (!campaign) {
          sendJson(response, 404, { ok: false, error: "campaign_not_found", id: path[1] });
          return;
        }
        sendJson(response, 200, { ok: true, campaign });
        return;
      }
      if (request.method === "PATCH") {
        const body = await readJson(request);
        const campaign = store.updateCampaign(path[1], body);
        sendJson(response, 200, { ok: true, campaign });
        return;
      }
      if (request.method === "DELETE") {
        const result = store.deleteCampaign(path[1]);
        sendJson(response, 200, result);
        return;
      }
    }

    if (path[0] === "content" && !path[1]) {
      if (request.method === "GET") {
        const filters = {
          workspace_id: request.query?.workspace_id || "workspace_local",
          campaign_id: request.query?.campaign_id,
          search: request.query?.search,
          status: request.query?.status,
          limit: parseInt(request.query?.limit || "50", 10),
          offset: parseInt(request.query?.offset || "0", 10)
        };
        const content_items = store.listContentItems(filters);
        sendJson(response, 200, { ok: true, content_items });
        return;
      }
      if (request.method === "POST") {
        const body = await readJson(request);
        const content_item = store.createContentItem({ ...body, workspace_id: body.workspace_id || "workspace_local" });
        sendJson(response, 201, { ok: true, content_item });
        return;
      }
    }

    if (path[0] === "content" && path[1]) {
      if (request.method === "GET") {
        const content_item = store.getContentItem(path[1]);
        if (!content_item) {
          sendJson(response, 404, { ok: false, error: "content_item_not_found", id: path[1] });
          return;
        }
        sendJson(response, 200, { ok: true, content_item });
        return;
      }
      if (request.method === "PATCH") {
        const body = await readJson(request);
        const content_item = store.updateContentItem(path[1], body);
        sendJson(response, 200, { ok: true, content_item });
        return;
      }
      if (request.method === "DELETE") {
        const result = store.deleteContentItem(path[1]);
        sendJson(response, 200, result);
        return;
      }
    }

    if (path[0] === "link" && !path[1]) {
      if (request.method === "POST") {
        const body = await readJson(request);
        const result = store.linkRenderJob(body.content_item_id, body.render_job_id);
        sendJson(response, 200, result);
        return;
      }
    }

    if (path[0] === "activity" && !path[1]) {
      if (request.method === "GET") {
        const filters = {
          workspace_id: request.query?.workspace_id || "workspace_local",
          entity_type: request.query?.entity_type,
          entity_id: request.query?.entity_id,
          limit: parseInt(request.query?.limit || "100", 10)
        };
        const activity = store.getActivity(filters);
        sendJson(response, 200, { ok: true, activity });
        return;
      }
    }

    if (path[0] === "export" && !path[1]) {
      if (request.method === "POST") {
        const exported = store.exportJson();
        sendJson(response, 200, { ok: true, export: exported });
        return;
      }
    }

    if (path[0] === "import" && !path[1]) {
      if (request.method === "POST") {
        const body = await readJson(request);
        const imported = store.importJson(body);
        sendJson(response, 200, { ok: true, imported });
        return;
      }
    }

    sendJson(response, 404, { ok: false, error: "workspace_route_not_found", path: path.join("/") });
  } finally {
    store.close();
  }
}
