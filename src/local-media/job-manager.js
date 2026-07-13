import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import path from "node:path";

import { getPlatformRecipe } from "../domain/platform-recipes.js";
import { validateBoardProject } from "../media/render-project.js";

const MAX_PROJECT_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_JOBS = 20;

export function createLocalMediaJobManager({
  executeRender,
  cleanupRender = async () => {},
  persistVerifiedCandidate = null,
  verifyArtifactEvidence = verifyArtifactEvidenceOnDisk,
  maxConcurrent = 1,
  maxJobs = DEFAULT_MAX_JOBS,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof executeRender !== "function") throw new TypeError("executeRender is required");
  if (typeof cleanupRender !== "function") throw new TypeError("cleanupRender must be a function");
  if (persistVerifiedCandidate !== null && typeof persistVerifiedCandidate !== "function") {
    throw new TypeError("persistVerifiedCandidate must be a function or null");
  }
  if (typeof verifyArtifactEvidence !== "function") {
    throw new TypeError("verifyArtifactEvidence must be a function");
  }
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4) {
    throw new RangeError("maxConcurrent must be within 1..4");
  }
  if (!Number.isSafeInteger(maxJobs) || maxJobs < maxConcurrent || maxJobs > 100) {
    throw new RangeError("maxJobs must be within maxConcurrent..100");
  }

  const jobs = new Map();
  const queue = [];
  let active = 0;

  function submit({ project, projectId, platform = "youtube_video" } = {}) {
    validateProject(project);
    const persistedProjectId = normalizeProjectId(projectId);
    const recipe = getPlatformRecipe(platform);
    evictFinishedJobs();
    if (jobs.size >= maxJobs) throw new Error("Local media job capacity reached");

    const completion = deferred();
    const record = {
      id: `job_${randomUUID()}`,
      status: "queued",
      platform: recipe.platformId,
      recipeId: recipe.id,
      projectId: persistedProjectId,
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
      candidate: null,
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
      requirePassedRenderQc(result);
      applyResult(record, result);
      await persistCandidate(record, result);
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

  async function persistCandidate(record, result) {
    if (!record.projectId) {
      record.candidate = blockedCandidate("persisted_project_required");
      return;
    }
    if (!persistVerifiedCandidate) {
      record.candidate = blockedCandidate("publish_candidate_persistence_not_configured");
      return;
    }
    try {
      const verifiedRender = buildVerifiedRenderEvidence(record, result);
      await verifyArtifactEvidence({
        artifactPaths: new Map(record.artifactPaths),
        artifacts: verifiedRender.artifacts
      });
      const candidate = await persistVerifiedCandidate({
        projectId: record.projectId,
        project: structuredClone(record.project),
        verifiedRender
      });
      record.candidate = publicCandidateReference(candidate);
    } catch {
      record.candidate = blockedCandidate("publish_candidate_persistence_failed");
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
    for (const [filePath, type, suppliedArtifact] of [
      [result?.manifestPath, "application/json", result?.manifestArtifact],
      [result?.manifestHashPath, "text/plain", null]
    ]) {
      const resolvedFile = requireDirectChild(outputDir, filePath);
      const name = safeArtifactName(path.basename(resolvedFile));
      record.artifactPaths.set(name, resolvedFile);
      const described = suppliedArtifact?.name === name
        ? normalizeEvidenceArtifact(suppliedArtifact)
        : null;
      publicArtifacts.push(described || { name, type, bytes: null, sha256: null });
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

function requirePassedRenderQc(result) {
  if (result?.manifest?.qc?.passed === false) {
    throw new TypeError("Render result failed quality control");
  }
}

function buildVerifiedRenderEvidence(record, result) {
  const manifest = result?.manifest;
  if (!manifest || manifest.qc?.passed !== true) {
    throw new TypeError("Render result is not independently verified");
  }
  const recipe = getPlatformRecipe(record.platform);
  if (manifest.recipe?.id !== recipe.id || record.recipeId !== recipe.id) {
    throw new TypeError("Render recipe evidence mismatch");
  }
  const artifacts = (Array.isArray(manifest.artifacts) ? manifest.artifacts : [])
    .map(normalizeEvidenceArtifact);
  const manifestArtifact = normalizeEvidenceArtifact(result?.manifestArtifact);
  const expectedManifestName = `${recipe.id}.manifest.json`;
  const expectedVideoName = `${recipe.id}.mp4`;
  if (manifestArtifact.name !== expectedManifestName || manifestArtifact.type !== "application/json") {
    throw new TypeError("Render manifest evidence mismatch");
  }
  const videoArtifact = artifacts.find(artifact => artifact.name === expectedVideoName);
  if (!videoArtifact || videoArtifact.type !== "video/mp4") {
    throw new TypeError("Verified render video evidence is missing");
  }
  return {
    recipe: {
      id: recipe.id,
      version: recipe.version,
      platform: recipe.platformId,
      width: recipe.width,
      height: recipe.height
    },
    platforms: [recipe.platformId],
    artifacts: [...artifacts, manifestArtifact].sort((left, right) => left.name.localeCompare(right.name)),
    manifestSha256: manifestArtifact.sha256,
    verifier: "local-media-worker-r1"
  };
}

function normalizeEvidenceArtifact(value) {
  const name = safeArtifactName(value?.name);
  const type = String(value?.type || "").trim().toLowerCase();
  const bytes = Number(value?.bytes);
  const sha256 = String(value?.sha256 || "").trim().toLowerCase();
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type)) {
    throw new TypeError("Render evidence contains an invalid artifact type");
  }
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 20 * 1024 * 1024 * 1024) {
    throw new TypeError("Render evidence contains an invalid artifact size");
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new TypeError("Render evidence contains an invalid artifact hash");
  }
  return { name, type, bytes, sha256 };
}

async function verifyArtifactEvidenceOnDisk({ artifactPaths, artifacts }) {
  if (!(artifactPaths instanceof Map) || !Array.isArray(artifacts)) {
    throw new TypeError("Render artifact verification input is invalid");
  }
  for (const artifact of artifacts) {
    const filePath = artifactPaths.get(artifact.name);
    if (!filePath) throw new TypeError("Render artifact evidence is missing a file");
    const info = await lstat(filePath);
    if (!info.isFile() || info.size !== artifact.bytes) {
      throw new TypeError("Render artifact evidence byte count mismatch");
    }
    const actualSha256 = await sha256File(filePath);
    if (actualSha256 !== artifact.sha256) {
      throw new TypeError("Render artifact evidence hash mismatch");
    }
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", chunk => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

function publicCandidateReference(candidate) {
  const id = String(candidate?.id || "");
  const digest = String(candidate?.digest || "");
  const version = Number(candidate?.version);
  if (!/^cand_[A-Za-z0-9_-]{2,120}$/.test(id) || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new TypeError("Candidate persistence returned an invalid identity");
  }
  if (!Number.isSafeInteger(version) || version < 1 || candidate?.status !== "sealed") {
    throw new TypeError("Candidate persistence returned an invalid sealed record");
  }
  return {
    id,
    digest,
    version,
    status: "sealed",
    approvable: Boolean(candidate.approvable),
    blockers: stringList(candidate.approvalBlockers)
  };
}

function blockedCandidate(blocker) {
  return {
    status: "blocked",
    approvable: false,
    blockers: [blocker]
  };
}

function normalizeProjectId(value) {
  const id = String(value || "").trim();
  if (!id) return null;
  if (!/^[A-Za-z0-9_-]{2,120}$/.test(id)) throw new TypeError("Invalid persisted project id");
  return id;
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
    candidate: record.candidate,
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
  return message
    .replace(/[A-Za-z]:\\[^\s"'<>]+/gu, "<path>")
    .replace(/\/[^\s"'<>]+/gu, "<path>");
}

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}
