import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const COLLECTIONS = new Set(["projects", "assets", "jobs", "audit"]);

export function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

export function getStorageStatus() {
  const inVercel = Boolean(process.env.VERCEL);
  const demoStorageEnabled = process.env.HERMEST_ENABLE_DEMO_STORAGE === "1";
  const externalConfigPresent = Boolean(
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.BLOB_READ_WRITE_TOKEN
  );
  const writeEnabled = !inVercel || demoStorageEnabled;
  const durable = !inVercel;
  const warnings = [];

  if (inVercel && !demoStorageEnabled) {
    warnings.push("server_storage_write_disabled_on_vercel_without_persistent_backend");
  }
  if (inVercel && demoStorageEnabled) {
    warnings.push("demo_storage_uses_ephemeral_vercel_tmp_and_can_be_lost");
  }
  if (externalConfigPresent) {
    warnings.push("external_storage_env_detected_but_adapter_not_enabled_yet");
  }

  return {
    ok: true,
    adapter: "json-file",
    durable,
    writeEnabled,
    demoStorageEnabled,
    externalConfigPresent,
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
  const dir = collectionPath(collection);
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (_) {
    return [];
  }

  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const record = JSON.parse(await readFile(join(dir, entry.name), "utf8"));
      records.push(record);
    } catch (_) {}
  }
  return records.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

export async function getRecord(collection, id) {
  assertSafeId(id);
  try {
    return JSON.parse(await readFile(recordPath(collection, id), "utf8"));
  } catch (_) {
    return null;
  }
}

export async function saveRecord(collection, record) {
  assertCollection(collection);
  assertSafeId(record.id);
  ensureWriteEnabled();
  const dir = collectionPath(collection);
  await mkdir(dir, { recursive: true });
  const target = recordPath(collection, record.id);
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(record, null, 2));
  await rename(tmp, target);
  return record;
}

export async function deleteRecord(collection, id) {
  assertSafeId(id);
  ensureWriteEnabled();
  await rm(recordPath(collection, id), { force: true });
}

export async function appendAudit(action, payload = {}) {
  const storage = getStorageStatus();
  if (!storage.writeEnabled) return null;
  const now = new Date().toISOString();
  const record = {
    id: createId("aud"),
    action,
    payload,
    createdAt: now,
    updatedAt: now
  };
  await saveRecord("audit", record);
  return record;
}

function recordPath(collection, id) {
  assertCollection(collection);
  assertSafeId(id);
  return join(collectionPath(collection), `${id}.json`);
}

function collectionPath(collection) {
  assertCollection(collection);
  return join(dataRoot(), collection);
}

function dataRoot() {
  return process.env.HERMEST_DATA_DIR || join(process.env.VERCEL ? tmpdir() : process.cwd(), ".data", "hermest-board");
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
