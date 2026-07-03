import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import product from "../api/product.js";

const originalEnv = { ...process.env };
const dataDir = mkdtempSync(join(tmpdir(), "hermest-api-smoke-"));

try {
  process.env.HERMEST_DATA_DIR = dataDir;
  delete process.env.VERCEL;
  delete process.env.HERMEST_ENABLE_DEMO_STORAGE;
  delete process.env.HERMEST_OWNER_TOKEN;

  await expect("storage", "GET", "storage/status", null, 200);
  await expect("agent-plan", "POST", "agent/plan", {
    platforms: ["youtube_video"],
    tools: ["parser", "translator"],
    languages: ["ru", "en"]
  }, 200);

  const created = await expect("project-create", "POST", "projects", {
    project: {
      title: "API smoke",
      cards: [{ id: "card1", title: "One", text: "Test" }],
      links: [],
      publish: { platforms: ["youtube_video"], languages: "ru" }
    }
  }, 201);
  const id = created.project.id;

  await expect("project-get", "GET", `projects/${id}`, null, 200);
  await expect("project-update", "PUT", `projects/${id}`, {
    project: {
      title: "API smoke updated",
      cards: [{ id: "card1", title: "One", text: "Updated" }],
      links: [],
      publish: { platforms: ["youtube_video"], languages: "ru,en" }
    }
  }, 200);
  await expect("asset-create", "POST", "assets", {
    projectId: id,
    title: "Reference",
    url: "https://example.com/reference",
    rightsStatus: "unknown"
  }, 201);
  const blockedJob = await expect("job-create", "POST", "jobs", {
    projectId: id,
    publishPack: { platforms: ["youtube_video"], tools: ["parser"], languages: ["ru"] }
  }, 201);
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
  const readUnauthorized = await expect("demo-storage-read-token-required", "GET", "projects", null, 401);
  if (readUnauthorized.error !== "unauthorized") {
    throw new Error(`Expected unauthorized read guard, got ${readUnauthorized.error}`);
  }
  await expect("owner-token-read", "GET", "projects", null, 200, { authorization: "Bearer local-owner-token" });
  const authed = await expect("owner-token-write", "POST", "projects", {
    project: { title: "owner ok", cards: [] }
  }, 201, { authorization: "Bearer local-owner-token" });
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
