import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJsonFileStorageAdapter } from "./storage-adapters/json-file.js";
import { createPostgresStorageAdapter } from "./storage-adapters/postgres.js";

const COLLECTIONS = new Set(["projects", "assets", "jobs", "audit", "connectors", "users"]);
const STORAGE_ADAPTER_INTERFACE_VERSION = 1;

export function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function getStorageStatus() {
  const inVercel = Boolean(process.env.VERCEL);
  const demoStorageEnabled = process.env.HERMEST_ENABLE_DEMO_STORAGE === "1";
  const durableStorageRequested = process.env.HERMEST_ENABLE_DURABLE_STORAGE === "1";
  const configuredAdapter = storageAdapterName();
  const postgresConfigPresent = Boolean(postgresConnectionString());
  const postgresAdapterConfigured = configuredAdapter === "postgres" && postgresConfigPresent;
  const postgresAdapterEnabled = postgresAdapterConfigured && (!inVercel || durableStorageRequested);
  const authGuardConfigured = Boolean(process.env.HERMEST_OWNER_TOKEN || process.env.HERMEST_SESSION_SECRET);
  const adapter = getStorageAdapter();
  const externalConfigPresent = Boolean(
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.BLOB_READ_WRITE_TOKEN
  );
  const writeEnabled = !inVercel || demoStorageEnabled || (postgresAdapterEnabled && authGuardConfigured);
  const durable = postgresAdapterEnabled || !inVercel;
  const warnings = [];

  if (inVercel && !demoStorageEnabled) {
    warnings.push("server_storage_write_disabled_on_vercel_without_persistent_backend");
  }
  if (inVercel && demoStorageEnabled) {
    warnings.push("demo_storage_uses_ephemeral_vercel_tmp_and_can_be_lost");
  }
  if (configuredAdapter === "postgres" && !postgresConfigPresent) {
    warnings.push("postgres_adapter_selected_without_database_url");
  }
  if (postgresAdapterConfigured && !postgresAdapterEnabled) {
    warnings.push("durable_postgres_adapter_configured_but_not_enabled");
  }
  if (postgresAdapterEnabled && !authGuardConfigured) {
    warnings.push("durable_postgres_adapter_enabled_without_auth_guard");
  }
  if (externalConfigPresent && !postgresAdapterConfigured) {
    warnings.push("external_storage_env_detected_but_adapter_not_enabled_yet");
  }

  return {
    ok: true,
    adapter: adapter.id,
    adapterKind: adapter.kind,
    configuredAdapter,
    adapterInterfaceVersion: STORAGE_ADAPTER_INTERFACE_VERSION,
    durableAdapterImplemented: true,
    durableAdapterConfigured: postgresAdapterConfigured,
    durableAdapterEnabled: postgresAdapterEnabled,
    durableStorageRequested,
    durable,
    writeEnabled,
    demoStorageEnabled,
    externalConfigPresent,
    postgresConfigPresent,
    requiredForProduction: [
      "database_or_blob_storage_adapter",
      "user_accounts_and_sessions",
      "per_user_authorization",
      "encrypted_connector_token_storage"
    ],
    warnings
  };
}

export function ensureWriteEnabled() {
  const storage = getStorageStatus();
  if (storage.writeEnabled) return storage;
  const error = new Error("server_storage_not_configured");
  error.status = 501;
  error.code = "server_storage_not_configured";
  error.storage = storage;
  error.note = "Public Vercel storage writes are disabled until a durable per-user backend is connected.";
  throw error;
}

export async function listRecords(collection) {
  assertCollection(collection);
  return getStorageAdapter().listRecords(collection);
}

export async function getRecord(collection, id) {
  assertCollection(collection);
  assertSafeId(id);
  return getStorageAdapter().getRecord(collection, id);
}

export async function saveRecord(collection, record) {
  assertCollection(collection);
  assertSafeId(record.id);
  ensureWriteEnabled();
  return getStorageAdapter().saveRecord(collection, record);
}

export async function deleteRecord(collection, id) {
  assertCollection(collection);
  assertSafeId(id);
  ensureWriteEnabled();
  await getStorageAdapter().deleteRecord(collection, id);
}

export async function appendAudit(action, payload = {}, actor = null) {
  const storage = getStorageStatus();
  if (!storage.writeEnabled) return null;
  const now = new Date().toISOString();
  const actorRecord = actorSnapshot(actor);
  const record = {
    id: createId("aud"),
    workspaceId: safeText(payload.workspaceId || defaultWorkspaceId(actor), 120),
    ownerUserId: safeText(payload.ownerUserId || defaultOwnerUserId(actor), 120),
    action,
    actor: actorRecord,
    payload,
    createdAt: now,
    updatedAt: now
  };
  await saveRecord("audit", record);
  return record;
}

function getStorageAdapter() {
  if (postgresAdapterActive()) {
    return createPostgresStorageAdapter({
      connectionString: postgresConnectionString(),
      assertCollection,
      assertSafeId
    });
  }

  return createJsonFileStorageAdapter({
    dataRoot: dataRoot(),
    assertCollection,
    assertSafeId
  });
}

function dataRoot() {
  return process.env.HERMEST_DATA_DIR || join(process.env.VERCEL ? tmpdir() : process.cwd(), ".data", "hermest-board");
}

function postgresAdapterActive() {
  if (storageAdapterName() !== "postgres" || !postgresConnectionString()) return false;
  return !process.env.VERCEL || process.env.HERMEST_ENABLE_DURABLE_STORAGE === "1";
}

function storageAdapterName() {
  return String(process.env.HERMEST_STORAGE_ADAPTER || "json-file").trim().toLowerCase();
}

function postgresConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
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

function safeText(value, limit) {
  return String(value || "").slice(0, limit);
}

function assertCollection(collection) {
  if (!COLLECTIONS.has(collection)) throw new Error(`unknown_collection:${collection}`);
}

function assertSafeId(id) {
  if (!/^[a-z0-9_-]{3,120}$/i.test(String(id || ""))) {
    const error = new Error("invalid_id");
    error.status = 400;
    error.code = "invalid_id";
    throw error;
  }
}
