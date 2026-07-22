// Лёгкий стор джобов для wizard-драфта: браузерный reasoning-мост думает
// минутами, поэтому HTTP отдаёт 202 + id, а клиент опрашивает статус.
// Отдельно от render job-manager: здесь нет очереди, артефактов и QC.

import { randomUUID } from "node:crypto";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_JOBS = 32;
const FINISHED_STATUSES = ["completed", "failed", "cancelled"];

export function createDraftJobManager({
  runDraft,
  now = () => new Date().toISOString(),
  idFactory = () => `draft_${randomUUID()}`,
  ttlMs = DEFAULT_TTL_MS,
  maxJobs = DEFAULT_MAX_JOBS
} = {}) {
  if (typeof runDraft !== "function") throw new TypeError("runDraft is required");
  if (typeof now !== "function") throw new TypeError("now must be a function");
  if (typeof idFactory !== "function") throw new TypeError("idFactory must be a function");
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000) throw new RangeError("ttlMs must be at least 1000");
  if (!Number.isSafeInteger(maxJobs) || maxJobs < 1 || maxJobs > 256) {
    throw new RangeError("maxJobs must be within 1..256");
  }

  const jobs = new Map();

  function submit(params = {}) {
    const topic = requireTopic(params.topic);
    evictJobs();
    if (jobs.size >= maxJobs) {
      throw Object.assign(new Error("draft_jobs_capacity"), {
        statusCode: 429,
        publicCode: "draft_jobs_capacity"
      });
    }

    const record = {
      id: String(idFactory()),
      status: "queued",
      createdAt: now(),
      controller: new AbortController(),
      board: null,
      warnings: [],
      error: null
    };
    jobs.set(record.id, record);
    // Параметры живут только в замыкании исполнителя: наружу через get() уходит
    // публичный вид, в котором их нет вовсе.
    void execute(record, { ...params, topic });
    return publicJob(record);
  }

  function get(id) {
    const record = jobs.get(String(id || ""));
    return record ? publicJob(record) : null;
  }

  function cancel(id) {
    const record = jobs.get(String(id || ""));
    if (!record || !["queued", "running"].includes(record.status)) return false;
    record.status = "cancelling";
    record.controller.abort(new Error("draft_job_cancelled"));
    return true;
  }

  async function execute(record, params) {
    record.status = "running";
    try {
      const result = await runDraft({ ...params, signal: record.controller.signal });
      if (record.controller.signal.aborted) throw record.controller.signal.reason;
      record.board = result?.board ?? null;
      record.warnings = stringList(result?.warnings);
      record.status = "completed";
    } catch (error) {
      if (record.controller.signal.aborted || record.status === "cancelling") {
        record.status = "cancelled";
      } else {
        record.status = "failed";
        record.error = sanitizeErrorMessage(error);
      }
    }
  }

  function evictJobs() {
    const deadline = Date.parse(now()) - ttlMs;
    for (const [id, record] of jobs) {
      if (!FINISHED_STATUSES.includes(record.status)) continue;
      const createdAt = Date.parse(record.createdAt);
      if (Number.isFinite(deadline) && Number.isFinite(createdAt) && createdAt > deadline) continue;
      jobs.delete(id);
    }
    // Map хранит порядок вставки, поэтому первыми выбывают самые старые завершённые.
    for (const [id, record] of jobs) {
      if (jobs.size < maxJobs) break;
      if (!FINISHED_STATUSES.includes(record.status)) continue;
      jobs.delete(id);
    }
  }

  return Object.freeze({ submit, get, cancel });
}

function requireTopic(value) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("draft topic is required");
  return value;
}

function publicJob(record) {
  return structuredClone({
    id: record.id,
    status: record.status,
    createdAt: record.createdAt,
    board: record.status === "completed" ? record.board : null,
    warnings: record.warnings,
    error: record.error
  });
}

function stringList(values) {
  return Array.isArray(values) ? values.map(String).filter(Boolean) : [];
}

// Наружу уходит только сообщение без стека и без абсолютных путей.
function sanitizeErrorMessage(error) {
  return String(error?.message || error || "draft_failed")
    .slice(0, 500)
    .replace(/[A-Za-z]:\\[^\s"'<>]+/gu, "<path>")
    .replace(/\/[^\s"'<>]+/gu, "<path>");
}
