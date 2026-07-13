import { randomUUID } from "node:crypto";
import path from "node:path";

import { getPlatformRecipe } from "../domain/platform-recipes.js";
import { validateBoardProject } from "../media/render-project.js";

const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_JOBS = 20;

export function createLocalMediaJobManager({
  executeRender,
  cleanupRender = async () => {},
  maxConcurrent = 1,
  maxJobs = DEFAULT_MAX_JOBS,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof executeRender !== "function") throw new TypeError("executeRender is required");
  if (typeof cleanupRender !== "function") throw new TypeError("cleanupRender must be a function");
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4) {
    throw new RangeError("maxConcurrent must be within 1..4");
  }
  if (!Number.isSafeInteger(maxJobs) || maxJobs < maxConcurrent || maxJobs > 100) {
    throw new RangeError("maxJobs must be within maxConcurrent..100");
  }

  const jobs = new Map();
  const queue = [];
  let active = 0;

  function submit({ project, platform = "youtube_video" } = {}) {
    validateProject(project);
    const recipe = getPlatformRecipe(platform);
    evictFinishedJobs();
    if (jobs.size >= maxJobs) throw new Error("Local media job capacity reached");

    const completion = deferred();
    const record = {
      id: `job_${randomUUID()}`,
      status: "queued",
      platform: recipe.platformId,
      recipeId: recipe.id,
      createdAt: now(),
      startedAt: null,
      completedAt: null,
      project: structuredClone(project),
      controller: new AbortController(),
      completion,
      result: null,
      outputDir: null,
      artifactPaths: new Map(),
      artifacts: [],
      blockers: [],
      warnings: [],
      error: null
    };
    jobs.set(record.id, record);
    queue.push(record.id);
    pump();
    return publicJob(record);
  }

  function get(id) {
    const record = jobs.get(String(id || ""));
    return record ? publicJob(record) : null;
  }

  function cancel(id) {
    const record = jobs.get(String(id || ""));
    if (!record || !["queued", "running"].includes(record.status)) return false;
    if (record.status === "queued") {
      record.status = "cancelled";
      record.completedAt = now();
      record.completion.resolve(publicJob(record));
      return true;
    }
    record.status = "cancelling";
    record.controller.abort(new Error("Render job cancelled"));
    return true;
  }

  async function waitFor(id) {
    const record = jobs.get(String(id || ""));
    if (!record) throw new RangeError("Unknown local media job");
    return record.completion.promise;
  }

  function resolveArtifact(id, name) {
    const record = jobs.get(String(id || ""));
    const artifactPath = record?.status === "completed"
      ? record.artifactPaths.get(String(name || ""))
      : null;
    if (!artifactPath) throw new RangeError("Artifact is not available for this job");
    return artifactPath;
  }

  function pump() {
    while (active < maxConcurrent && queue.length > 0) {
      const id = queue.shift();
      const record = jobs.get(id);
      if (!record || record.status !== "queued") continue;
      active += 1;
      record.status = "running";
      record.startedAt = now();
      void execute(record);
    }
  }

  async function execute(record) {
    try {
      const result = await executeRender({
        project: structuredClone(record.project),
        platform: record.platform,
        signal: record.controller.signal,
        jobId: record.id
      });
      if (record.controller.signal.aborted) throw record.controller.signal.reason;
      applyResult(record, result);
      record.status = "completed";
    } catch (error) {
      if (record.controller.signal.aborted || record.status === "cancelling") {
        record.status = "cancelled";
      } else {
        record.status = "failed";
        record.error = sanitizeErrorMessage(error);
      }
    } finally {
      record.project = null;
      record.completedAt = now();
      active -= 1;
      record.completion.resolve(publicJob(record));
      pump();
    }
  }

  function applyResult(record, result) {
    const outputDir = requirePrivateRunDirectory(result?.outputDir);
    const manifest = result?.manifest && typeof result.manifest === "object" ? result.manifest : {};
    const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
    const publicArtifacts = [];
    for (const artifact of artifacts) {
      const name = safeArtifactName(artifact?.name);
      record.artifactPaths.set(name, path.join(outputDir, name));
      publicArtifacts.push({
        name,
        type: String(artifact?.type || "application/octet-stream"),
        bytes: Number(artifact?.bytes || 0),
        sha256: String(artifact?.sha256 || "")
      });
    }
    for (const [filePath, type] of [
      [result?.manifestPath, "application/json"],
      [result?.manifestHashPath, "text/plain"]
    ]) {
      const resolvedFile = requireDirectChild(outputDir, filePath);
      const name = safeArtifactName(path.basename(resolvedFile));
      record.artifactPaths.set(name, resolvedFile);
      publicArtifacts.push({ name, type, bytes: null, sha256: null });
    }
    record.result = { recipeId: String(manifest?.recipe?.id || record.recipeId) };
    record.outputDir = outputDir;
    record.recipeId = record.result.recipeId;
    record.artifacts = dedupeArtifacts(publicArtifacts);
    record.blockers = stringList(manifest.blockers);
    record.warnings = stringList(manifest.warnings);
  }

  function evictFinishedJobs() {
    for (const [id, record] of jobs) {
      if (jobs.size < maxJobs) break;
      if (!["completed", "failed", "cancelled"].includes(record.status)) continue;
      jobs.delete(id);
      if (record.outputDir) {
        Promise.resolve(cleanupRender({ outputDir: record.outputDir, jobId: record.id })).catch(() => {});
      }
    }
  }

  return Object.freeze({ submit, get, cancel, waitFor, resolveArtifact });
}

function validateProject(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    throw new TypeError("Local render project must be an object");
  }
  validateBoardProject(project);
  const bytes = Buffer.byteLength(JSON.stringify(project), "utf8");
  if (bytes <= 0 || bytes > MAX_PROJECT_BYTES) {
    throw new RangeError(`Local render project exceeds the ${MAX_PROJECT_BYTES} byte limit`);
  }
}

function publicJob(record) {
  return structuredClone({
    id: record.id,
    status: record.status,
    platform: record.platform,
    recipeId: record.recipeId,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    artifacts: record.artifacts,
    blockers: record.blockers,
    warnings: record.warnings,
    error: record.error
  });
}

function requirePrivateRunDirectory(value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError("Render adapter must return an absolute output directory");
  }
  const resolved = path.resolve(value);
  const relative = path.relative("/tmp", resolved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new TypeError("Render adapter output directory must be a private child of /tmp");
  }
  return resolved;
}

function requireDirectChild(outputDir, value) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new TypeError("Render adapter artifact path must be absolute");
  }
  const resolved = path.resolve(value);
  if (path.dirname(resolved) !== outputDir) {
    throw new TypeError("Render adapter artifact path escapes its output directory");
  }
  return resolved;
}

function safeArtifactName(value) {
  const name = String(value || "");
  if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === "." || name === "..") {
    throw new TypeError("Render result contains an unsafe artifact name");
  }
  return name;
}

function dedupeArtifacts(artifacts) {
  return [...new Map(artifacts.map(artifact => [artifact.name, artifact])).values()];
}

function stringList(values) {
  return Array.isArray(values) ? [...new Set(values.map(String).filter(Boolean))] : [];
}

function sanitizeErrorMessage(error) {
  const message = String(error?.message || "render_failed").slice(0, 500);
  return message.replace(/\/[A-Za-z0-9_./-]+/g, "<path>");
}

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}
