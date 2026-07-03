import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import product from "../api/product.js";
import { createSignedSessionToken } from "../api/_lib/session.js";

const originalEnv = { ...process.env };
const dataDir = mkdtempSync(join(tmpdir(), "hermest-api-smoke-"));

try {
  process.env.HERMEST_DATA_DIR = dataDir;
  delete process.env.VERCEL;
  delete process.env.HERMEST_ENABLE_DEMO_STORAGE;
  delete process.env.HERMEST_OWNER_TOKEN;
  delete process.env.HERMEST_SESSION_SECRET;

  const storageStatus = await expect("storage", "GET", "storage/status", null, 200);
  if (storageStatus.adapter !== "json-file" || storageStatus.adapterInterfaceVersion !== 1) {
    throw new Error(`Expected json-file storage adapter contract, got ${JSON.stringify(storageStatus)}`);
  }
  const preflight = await expect("preflight", "GET", "preflight", null, 200);
  if (preflight.launchReady !== false || preflight.canAutopublish !== false) {
    throw new Error(`Expected blocked alpha preflight, got ${JSON.stringify(preflight)}`);
  }
  if (preflight.storage.adapterInterfaceImplemented !== true || preflight.storage.durableAdapterImplemented !== false) {
    throw new Error(`Expected adapter boundary without durable adapter, got ${JSON.stringify(preflight.storage)}`);
  }
  if (!preflight.blockers.includes("real_user_auth_not_implemented")) {
    throw new Error(`Expected real auth blocker, got ${JSON.stringify(preflight.blockers)}`);
  }
  await expect("agent-plan", "POST", "agent/plan", {
    platforms: ["youtube_video"],
    tools: ["parser", "translator"],
    languages: ["ru", "en"]
  }, 200);
  const localSession = await expect("session-current-local", "GET", "session/current", null, 200);
  if (localSession.actor.id !== "local-dev" || localSession.session.realUserAuthImplemented !== false) {
    throw new Error(`Expected local bootstrap session, got ${JSON.stringify(localSession)}`);
  }

  process.env.HERMEST_SESSION_SECRET = "local-session-secret-for-smoke";
  const signedToken = createSignedSessionToken({
    sub: "user_smoke",
    workspaceId: "workspace_smoke"
  });
  const signedSession = await expect("session-current-signed", "GET", "session/current", null, 200, { authorization: `Bearer ${signedToken}` });
  if (signedSession.actor.id !== "user_smoke" || signedSession.actor.workspaceId !== "workspace_smoke") {
    throw new Error(`Expected signed-session actor, got ${JSON.stringify(signedSession)}`);
  }
  const signedProject = await expect("project-create-signed-session", "POST", "projects", {
    project: { title: "signed session project", cards: [] }
  }, 201, { authorization: `Bearer ${signedToken}` });
  if (signedProject.project.workspaceId !== "workspace_smoke" || signedProject.project.ownerUserId !== "user_smoke") {
    throw new Error(`Expected signed-session ownership metadata, got ${JSON.stringify(signedProject.project)}`);
  }
  const otherToken = createSignedSessionToken({
    sub: "user_other",
    workspaceId: "workspace_other"
  });
  const signedList = await expect("project-list-signed-session", "GET", "projects", null, 200, { authorization: `Bearer ${signedToken}` });
  if (!signedList.projects.some(project => project.id === signedProject.project.id)) {
    throw new Error(`Expected signed project in signed-session list, got ${JSON.stringify(signedList.projects)}`);
  }
  const otherList = await expect("project-list-other-session", "GET", "projects", null, 200, { authorization: `Bearer ${otherToken}` });
  if (otherList.projects.some(project => project.id === signedProject.project.id)) {
    throw new Error(`Expected other workspace list to exclude signed project, got ${JSON.stringify(otherList.projects)}`);
  }
  const forbiddenSignedRead = await expect("project-read-other-session", "GET", `projects/${signedProject.project.id}`, null, 403, { authorization: `Bearer ${otherToken}` });
  if (forbiddenSignedRead.error !== "forbidden") {
    throw new Error(`Expected forbidden signed-session project read, got ${forbiddenSignedRead.error}`);
  }
  const signedAsset = await expect("asset-create-signed-session", "POST", "assets", {
    projectId: signedProject.project.id,
    title: "Signed reference",
    rightsStatus: "owned"
  }, 201, { authorization: `Bearer ${signedToken}` });
  if (signedAsset.asset.workspaceId !== signedProject.project.workspaceId || signedAsset.asset.ownerUserId !== signedProject.project.ownerUserId) {
    throw new Error(`Expected signed-session asset ownership metadata, got ${JSON.stringify(signedAsset.asset)}`);
  }
  const signedAssetList = await expect("asset-list-signed-session", "GET", "assets", null, 200, { authorization: `Bearer ${signedToken}` });
  if (!signedAssetList.assets.some(asset => asset.id === signedAsset.asset.id)) {
    throw new Error(`Expected signed asset in signed-session list, got ${JSON.stringify(signedAssetList.assets)}`);
  }
  const otherAssetList = await expect("asset-list-other-session", "GET", "assets", null, 200, { authorization: `Bearer ${otherToken}` });
  if (otherAssetList.assets.some(asset => asset.id === signedAsset.asset.id)) {
    throw new Error(`Expected other workspace asset list to exclude signed asset, got ${JSON.stringify(otherAssetList.assets)}`);
  }
  const forbiddenAssetAttach = await expect("asset-create-other-project-session", "POST", "assets", {
    projectId: signedProject.project.id,
    title: "Forbidden reference",
    rightsStatus: "owned"
  }, 403, { authorization: `Bearer ${otherToken}` });
  if (forbiddenAssetAttach.error !== "forbidden") {
    throw new Error(`Expected forbidden signed-session asset attach, got ${forbiddenAssetAttach.error}`);
  }
  const signedJob = await expect("job-create-signed-session", "POST", "jobs", {
    projectId: signedProject.project.id,
    publishPack: { platforms: ["youtube_video"], tools: ["parser"], languages: ["ru"] }
  }, 201, { authorization: `Bearer ${signedToken}` });
  if (signedJob.job.workspaceId !== signedProject.project.workspaceId || signedJob.job.ownerUserId !== signedProject.project.ownerUserId) {
    throw new Error(`Expected signed-session job ownership metadata, got ${JSON.stringify(signedJob.job)}`);
  }
  const signedJobList = await expect("job-list-signed-session", "GET", "jobs", null, 200, { authorization: `Bearer ${signedToken}` });
  if (!signedJobList.jobs.some(job => job.id === signedJob.job.id)) {
    throw new Error(`Expected signed job in signed-session list, got ${JSON.stringify(signedJobList.jobs)}`);
  }
  const otherJobList = await expect("job-list-other-session", "GET", "jobs", null, 200, { authorization: `Bearer ${otherToken}` });
  if (otherJobList.jobs.some(job => job.id === signedJob.job.id)) {
    throw new Error(`Expected other workspace job list to exclude signed job, got ${JSON.stringify(otherJobList.jobs)}`);
  }
  const forbiddenJobRead = await expect("job-read-other-session", "GET", `jobs/${signedJob.job.id}`, null, 403, { authorization: `Bearer ${otherToken}` });
  if (forbiddenJobRead.error !== "forbidden") {
    throw new Error(`Expected forbidden signed-session job read, got ${forbiddenJobRead.error}`);
  }
  const forbiddenJobPatch = await expect("job-patch-other-session", "PATCH", `jobs/${signedJob.job.id}`, {
    status: "running"
  }, 403, { authorization: `Bearer ${otherToken}` });
  if (forbiddenJobPatch.error !== "forbidden") {
    throw new Error(`Expected forbidden signed-session job patch, got ${forbiddenJobPatch.error}`);
  }
  const forbiddenJobCreate = await expect("job-create-other-project-session", "POST", "jobs", {
    projectId: signedProject.project.id,
    publishPack: { platforms: ["youtube_video"], tools: ["parser"], languages: ["ru"] }
  }, 403, { authorization: `Bearer ${otherToken}` });
  if (forbiddenJobCreate.error !== "forbidden") {
    throw new Error(`Expected forbidden signed-session job create, got ${forbiddenJobCreate.error}`);
  }
  await expect("project-delete-signed-session", "DELETE", `projects/${signedProject.project.id}`, null, 200, { authorization: `Bearer ${signedToken}` });
  delete process.env.HERMEST_SESSION_SECRET;

  const created = await expect("project-create", "POST", "projects", {
    project: {
      title: "API smoke",
      cards: [{ id: "card1", title: "One", text: "Test" }],
      links: [],
      publish: { platforms: ["youtube_video"], languages: "ru" }
    }
  }, 201);
  const id = created.project.id;
  if (created.project.workspaceId !== "workspace_local" || created.project.ownerUserId !== "local-dev") {
    throw new Error(`Expected local project ownership metadata, got ${JSON.stringify(created.project)}`);
  }
  if (created.project.project.workspaceId !== created.project.workspaceId || created.project.project.ownerUserId !== created.project.ownerUserId) {
    throw new Error(`Expected board document ownership metadata, got ${JSON.stringify(created.project.project)}`);
  }

  const fetched = await expect("project-get", "GET", `projects/${id}`, null, 200);
  if (fetched.project.workspaceId !== created.project.workspaceId || fetched.project.ownerUserId !== created.project.ownerUserId) {
    throw new Error(`Expected fetched ownership metadata to persist, got ${JSON.stringify(fetched.project)}`);
  }
  const updated = await expect("project-update", "PUT", `projects/${id}`, {
    workspaceId: "workspace_payload_must_not_take_over",
    ownerUserId: "payload-owner",
    project: {
      title: "API smoke updated",
      workspaceId: "workspace_payload_must_not_take_over",
      ownerUserId: "payload-owner",
      cards: [{ id: "card1", title: "One", text: "Updated" }],
      links: [],
      publish: { platforms: ["youtube_video"], languages: "ru,en" }
    }
  }, 200);
  if (updated.project.workspaceId !== created.project.workspaceId || updated.project.ownerUserId !== created.project.ownerUserId) {
    throw new Error(`Expected update to preserve ownership metadata, got ${JSON.stringify(updated.project)}`);
  }
  const createdAsset = await expect("asset-create", "POST", "assets", {
    projectId: id,
    title: "Reference",
    url: "https://example.com/reference",
    rightsStatus: "unknown"
  }, 201);
  if (createdAsset.asset.workspaceId !== created.project.workspaceId || createdAsset.asset.ownerUserId !== created.project.ownerUserId) {
    throw new Error(`Expected asset to inherit project ownership, got ${JSON.stringify(createdAsset.asset)}`);
  }
  const invalidAssetRights = await expect("asset-invalid-rights-status", "POST", "assets", {
    projectId: id,
    title: "Invalid rights",
    rightsStatus: "unreviewed"
  }, 400);
  if (invalidAssetRights.error !== "invalid_asset_rights_status") {
    throw new Error(`Expected invalid_asset_rights_status, got ${invalidAssetRights.error}`);
  }
  const blockedJob = await expect("job-create", "POST", "jobs", {
    projectId: id,
    publishPack: { platforms: ["youtube_video"], tools: ["parser"], languages: ["ru"] }
  }, 201);
  if (blockedJob.job.workspaceId !== created.project.workspaceId || blockedJob.job.ownerUserId !== created.project.ownerUserId) {
    throw new Error(`Expected job to inherit project ownership, got ${JSON.stringify(blockedJob.job)}`);
  }
  if (blockedJob.job.status !== "blocked") {
    throw new Error(`Expected blocked job, got ${blockedJob.job.status}`);
  }

  process.env.DATABASE_URL = "postgres://smoke.invalid/hermest";
  process.env.YOUTUBE_CLIENT_ID = "smoke-client-id";
  process.env.YOUTUBE_CLIENT_SECRET = "smoke-client-secret";
  const approvalJob = await expect("job-waiting-for-approval", "POST", "jobs", {
    projectId: id,
    publishPack: { platforms: ["youtube_video"], tools: ["parser"], languages: ["ru"] }
  }, 201);
  if (approvalJob.job.status !== "waiting_for_approval") {
    throw new Error(`Expected waiting_for_approval job, got ${approvalJob.job.status}`);
  }
  if (approvalJob.job.plan.status !== "ready_for_human_approval" || approvalJob.job.plan.canAutopublish !== false) {
    throw new Error(`Expected approval-only agent plan, got ${JSON.stringify(approvalJob.job.plan)}`);
  }
  await expect("job-update-running", "PATCH", `jobs/${approvalJob.job.id}`, {
    status: "running"
  }, 200);
  const invalidJobStatus = await expect("job-invalid-status", "PATCH", `jobs/${approvalJob.job.id}`, {
    status: "ready_for_approval"
  }, 400);
  if (invalidJobStatus.error !== "invalid_job_status") {
    throw new Error(`Expected invalid_job_status, got ${invalidJobStatus.error}`);
  }
  delete process.env.DATABASE_URL;
  delete process.env.YOUTUBE_CLIENT_ID;
  delete process.env.YOUTUBE_CLIENT_SECRET;

  await expect("audit-list", "GET", "audit", null, 200);
  await expect("project-delete", "DELETE", `projects/${id}`, null, 200);

  process.env.VERCEL = "1";
  delete process.env.HERMEST_ENABLE_DEMO_STORAGE;
  delete process.env.HERMEST_SESSION_SECRET;
  process.env.DATABASE_URL = "postgres://smoke.invalid/hermest";
  const externalStorageStatus = await expect("external-storage-status", "GET", "storage/status", null, 200);
  if (externalStorageStatus.writeEnabled !== false || externalStorageStatus.durable !== false) {
    throw new Error(`Expected external env to stay guarded, got ${JSON.stringify(externalStorageStatus)}`);
  }
  if (!externalStorageStatus.warnings?.includes("external_storage_env_detected_but_adapter_not_enabled_yet")) {
    throw new Error(`Expected external storage warning, got ${JSON.stringify(externalStorageStatus.warnings)}`);
  }
  delete process.env.DATABASE_URL;

  const guarded = await expect("production-write-guard", "POST", "projects", {
    project: { title: "blocked" }
  }, 501);
  if (guarded.error !== "server_storage_not_configured") {
    throw new Error(`Expected storage guard, got ${guarded.error}`);
  }

  process.env.HERMEST_ENABLE_DEMO_STORAGE = "1";
  const readAuthBlocked = await expect("demo-storage-read-auth-guard", "GET", "projects", null, 501);
  if (readAuthBlocked.error !== "read_auth_not_configured") {
    throw new Error(`Expected read_auth_not_configured, got ${readAuthBlocked.error}`);
  }

  const authBlocked = await expect("demo-storage-auth-guard", "POST", "projects", {
    project: { title: "blocked" }
  }, 501);
  if (authBlocked.error !== "write_auth_not_configured") {
    throw new Error(`Expected auth guard, got ${authBlocked.error}`);
  }

  process.env.HERMEST_OWNER_TOKEN = "local-owner-token";
  const ownerSession = await expect("session-current-owner", "GET", "session/current", null, 200, { authorization: "Bearer local-owner-token" });
  if (ownerSession.actor.id !== "owner" || ownerSession.session.realUserAuthImplemented !== false) {
    throw new Error(`Expected owner bootstrap session, got ${JSON.stringify(ownerSession)}`);
  }
  const readUnauthorized = await expect("demo-storage-read-token-required", "GET", "projects", null, 401);
  if (readUnauthorized.error !== "unauthorized") {
    throw new Error(`Expected unauthorized read guard, got ${readUnauthorized.error}`);
  }
  await expect("owner-token-read", "GET", "projects", null, 200, { authorization: "Bearer local-owner-token" });
  const authed = await expect("owner-token-write", "POST", "projects", {
    project: { title: "owner ok", cards: [] }
  }, 201, { authorization: "Bearer local-owner-token" });
  if (authed.project.workspaceId !== "workspace_owner" || authed.project.ownerUserId !== "owner") {
    throw new Error(`Expected owner-token ownership metadata, got ${JSON.stringify(authed.project)}`);
  }
  await expect("owner-token-read-created", "GET", `projects/${authed.project.id}`, null, 200, { authorization: "Bearer local-owner-token" });
  await expect("owner-token-delete", "DELETE", `projects/${authed.project.id}`, null, 200, { authorization: "Bearer local-owner-token" });

  console.log("smoke:api ok");
} finally {
  process.env = originalEnv;
  rmSync(dataDir, { recursive: true, force: true });
}

async function expect(name, method, route, body, expectedStatus, headers = {}) {
  const response = mockResponse();
  await product({
    method,
    query: { route },
    url: `/api/product?route=${encodeURIComponent(route)}`,
    headers,
    body
  }, response);
  if (response.statusCode !== expectedStatus) {
    throw new Error(`${name}: expected ${expectedStatus}, got ${response.statusCode} ${JSON.stringify(response.payload)}`);
  }
  if (response.payload?.ok === false && expectedStatus < 400) {
    throw new Error(`${name}: expected ok payload, got ${JSON.stringify(response.payload)}`);
  }
  return response.payload;
}

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
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
