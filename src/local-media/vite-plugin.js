import { createReadStream } from "node:fs";
import { stat, rm } from "node:fs/promises";
import path from "node:path";

import { renderProject } from "../media/render-project.js";
import { createLocalMediaJobManager } from "./job-manager.js";
import { createProviderKeyStore } from "./provider-keys.js";

const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;
const MUTATION_HEADER = "x-hermest-local-media";
const API_PREFIX = "/api/local-media";

export function createLocalMediaVitePlugin({ manager, maxBodyBytes, persistVerifiedCandidate = null, providerKeys } = {}) {
  const activeManager = manager || createLocalMediaJobManager({
    executeRender: ({ project, platform, signal }) => renderProject({
      project,
      platform,
      signal,
      outputDir: "/tmp"
    }),
    persistVerifiedCandidate,
    cleanupRender: ({ outputDir }) => rm(outputDir, { recursive: true, force: true })
  });
  const handler = createLocalMediaRequestHandler({
    manager: activeManager,
    maxBodyBytes,
    providerKeys: providerKeys || createProviderKeyStore()
  });
  return {
    name: "hermest-board-local-media",
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    }
  };
}

export function createLocalMediaRequestHandler({
  manager,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
  providerKeys = createProviderKeyStore()
} = {}) {
  if (!manager || typeof manager.submit !== "function") {
    throw new TypeError("A local media job manager is required");
  }
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 64 || maxBodyBytes > DEFAULT_MAX_BODY_BYTES) {
    throw new RangeError(`maxBodyBytes must be within 64..${DEFAULT_MAX_BODY_BYTES}`);
  }

  return function localMediaHandler(request, response, next) {
    void routeRequest(request, response, manager, maxBodyBytes, providerKeys, next).catch(error => {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      const status = Number(error?.statusCode) || statusForError(error);
      sendJson(response, status, {
        ok: false,
        error: publicError(error, status)
      });
    });
  };
}

async function routeRequest(request, response, manager, maxBodyBytes, providerKeys, next) {
  const host = String(request.headers.host || "");
  if (!isLoopbackHost(host) || !isAllowedOrigin(request.headers.origin, host)) {
    throw new HttpError(403, "local_media_origin_forbidden");
  }

  const requestUrl = new URL(request.url || "/", `http://${host}`);
  const pathname = requestUrl.pathname;
  if (!pathname.startsWith(API_PREFIX)) {
    if (typeof next === "function") {
      next();
      return;
    }
    throw new HttpError(404, "not_found");
  }

  if (request.method === "GET" && pathname === `${API_PREFIX}/status`) {
    sendJson(response, 200, {
      ok: true,
      mode: "local_only",
      renderer: "hermest-board-media-r1",
      publishEnabled: false
    });
    return;
  }

  if (request.method === "GET" && pathname === `${API_PREFIX}/providers`) {
    sendJson(response, 200, { ok: true, providers: providerKeys.listProviders() });
    return;
  }

  const providerMatch = pathname.match(new RegExp(`^${API_PREFIX}/providers/([a-z0-9-]+)/key$`));
  if (providerMatch && request.method === "POST") {
    requireMutationRequest(request);
    const body = await readJsonBody(request, maxBodyBytes);
    const provider = providerKeys.setKey(providerMatch[1], body.key);
    sendJson(response, 200, { ok: true, provider });
    return;
  }
  if (providerMatch && request.method === "DELETE") {
    requireMutationRequest(request);
    const provider = providerKeys.clearKey(providerMatch[1]);
    sendJson(response, 200, { ok: true, provider });
    return;
  }

  if (request.method === "POST" && pathname === `${API_PREFIX}/render`) {
    requireMutationRequest(request);
    const body = await readJsonBody(request, maxBodyBytes);
    const job = manager.submit({ project: body.project, projectId: body.projectId, platform: body.platform });
    sendJson(response, 202, { ok: true, job: decorateJob(job) });
    return;
  }

  const jobMatch = pathname.match(new RegExp(`^${API_PREFIX}/jobs/(job_[A-Za-z0-9-]+)$`));
  if (jobMatch && request.method === "GET") {
    const job = manager.get(jobMatch[1]);
    if (!job) throw new HttpError(404, "local_media_job_not_found");
    sendJson(response, 200, { ok: true, job: decorateJob(job) });
    return;
  }
  if (jobMatch && request.method === "DELETE") {
    requireMutationRequest(request);
    if (!manager.cancel(jobMatch[1])) throw new HttpError(409, "local_media_job_not_cancellable");
    sendJson(response, 202, { ok: true, job: decorateJob(manager.get(jobMatch[1])) });
    return;
  }

  const artifactMatch = pathname.match(
    new RegExp(`^${API_PREFIX}/jobs/(job_[A-Za-z0-9-]+)/artifacts/([^/]+)$`)
  );
  if (artifactMatch && request.method === "GET") {
    let artifactName;
    try {
      artifactName = decodeURIComponent(artifactMatch[2]);
    } catch {
      throw new HttpError(400, "invalid_artifact_name");
    }
    const job = manager.get(artifactMatch[1]);
    const artifact = job?.artifacts?.find(item => item.name === artifactName);
    if (!artifact) throw new HttpError(404, "local_media_artifact_not_found");
    let artifactPath;
    try {
      artifactPath = manager.resolveArtifact(artifactMatch[1], artifactName);
    } catch {
      throw new HttpError(404, "local_media_artifact_not_found");
    }
    const fileInfo = await stat(artifactPath);
    if (!fileInfo.isFile()) throw new HttpError(404, "local_media_artifact_not_found");
    response.statusCode = 200;
    response.setHeader("cache-control", "no-store");
    response.setHeader("content-type", artifact.type || "application/octet-stream");
    response.setHeader("content-length", String(fileInfo.size));
    response.setHeader("content-disposition", `attachment; filename="${path.basename(artifactName)}"`);
    response.setHeader("x-content-type-options", "nosniff");
    createReadStream(artifactPath).pipe(response);
    return;
  }

  throw new HttpError(404, "not_found");
}

function requireMutationRequest(request) {
  if (request.headers[MUTATION_HEADER] !== "1") {
    throw new HttpError(403, "local_media_mutation_header_required");
  }
  if (!String(request.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "application_json_required");
  }
}

async function readJsonBody(request, maxBodyBytes) {
  const chunks = [];
  let bytes = 0;
  let oversized = false;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) {
      oversized = true;
    } else {
      chunks.push(chunk);
    }
  }
  if (oversized) throw new HttpError(413, "local_media_request_too_large");
  if (bytes === 0) throw new HttpError(400, "local_media_json_body_required");
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError();
    return parsed;
  } catch {
    throw new HttpError(400, "invalid_local_media_json");
  }
}

function decorateJob(job) {
  if (!job) return null;
  return {
    ...job,
    artifacts: (job.artifacts || []).map(artifact => ({
      ...artifact,
      url: `${API_PREFIX}/jobs/${encodeURIComponent(job.id)}/artifacts/${encodeURIComponent(artifact.name)}`
    }))
  };
}

function isLoopbackHost(host) {
  try {
    const hostname = new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin, host) {
  if (!origin) return true;
  try {
    const parsed = new URL(String(origin));
    return parsed.protocol === "http:" && parsed.host.toLowerCase() === host.toLowerCase() && isLoopbackHost(parsed.host);
  } catch {
    return false;
  }
}

function sendJson(response, status, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  response.statusCode = status;
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", String(Buffer.byteLength(body)));
  response.setHeader("x-content-type-options", "nosniff");
  response.end(body);
}

function statusForError(error) {
  if (error instanceof RangeError || error instanceof TypeError) return 400;
  if (/capacity/i.test(String(error?.message || ""))) return 429;
  return 500;
}

export function publicError(error, status) {
  if (error instanceof HttpError) return error.publicCode;
  if (status < 500) return redactAbsolutePaths(String(error?.message || "invalid_request"));
  return "local_media_internal_error";
}

function redactAbsolutePaths(message) {
  return message
    .replace(/[A-Za-z]:\\[^\s"'<>]+/gu, "<path>")
    .replace(/\/[^\s"'<>]+/gu, "<path>");
}

class HttpError extends Error {
  constructor(statusCode, publicCode) {
    super(publicCode);
    this.statusCode = statusCode;
    this.publicCode = publicCode;
  }
}
