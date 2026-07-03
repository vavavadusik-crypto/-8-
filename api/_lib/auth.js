import { timingSafeEqual } from "node:crypto";
import { getSessionStatus, readSignedSession } from "./session.js";

export function getAuthStatus() {
  const inVercel = Boolean(process.env.VERCEL);
  const demoStorageEnabled = process.env.HERMEST_ENABLE_DEMO_STORAGE === "1";
  const durableStorageEnabled = isDurableStorageEnabled();
  const ownerTokenConfigured = Boolean(process.env.HERMEST_OWNER_TOKEN);
  const session = getSessionStatus();
  const authenticatedGuardConfigured = ownerTokenConfigured || session.secretConfigured;

  return {
    ok: true,
    mode: ownerTokenConfigured ? "owner-token" : session.secretConfigured ? "signed-session-or-readonly" : "development-or-readonly",
    ownerTokenConfigured,
    session,
    readAccess: inVercel && (demoStorageEnabled || durableStorageEnabled)
      ? authenticatedGuardConfigured
        ? "authenticated_request_required"
        : "blocked_until_auth_configured"
      : "public_readonly",
    writeAccess: authenticatedGuardConfigured
      ? "authenticated_request_required"
      : inVercel && (demoStorageEnabled || durableStorageEnabled)
        ? "blocked_until_auth_configured"
        : inVercel
          ? "blocked_by_storage_guard"
          : "local_development_open",
    productionSafe: authenticatedGuardConfigured || !inVercel || (!demoStorageEnabled && !durableStorageEnabled)
  };
}

export function requireReadAccess(request) {
  const status = getAuthStatus();
  const actor = getRequestActor(request);

  if (!process.env.VERCEL || (process.env.HERMEST_ENABLE_DEMO_STORAGE !== "1" && !isDurableStorageEnabled())) {
    return actor;
  }

  if (actor.authenticated) return actor;

  const authConfigured = status.ownerTokenConfigured || status.session.secretConfigured;
  const error = new Error(authConfigured ? "unauthorized" : "read_auth_not_configured");
  error.status = authConfigured ? 401 : 501;
  error.code = authConfigured ? "unauthorized" : "read_auth_not_configured";
  error.auth = status;
  error.note = authConfigured
    ? "Server-backed read routes require a valid signed session or owner token."
    : "Server-backed reads on public hosting require HERMEST_OWNER_TOKEN or HERMEST_SESSION_SECRET.";
  throw error;
}

export function getRequestActor(request) {
  const status = getAuthStatus();
  const signedSessionActor = readSignedSession(request);
  if (signedSessionActor) return signedSessionActor;

  if (!status.ownerTokenConfigured && !process.env.VERCEL) {
    return {
      authenticated: true,
      id: "local-dev",
      mode: "development"
    };
  }

  if (status.ownerTokenConfigured && tokenMatches(readToken(request), process.env.HERMEST_OWNER_TOKEN)) {
    return {
      authenticated: true,
      id: "owner",
      mode: "owner-token"
    };
  }

  return {
    authenticated: false,
    id: "anonymous",
    mode: status.mode
  };
}

export function requireWriteAccess(request) {
  const status = getAuthStatus();
  const actor = getRequestActor(request);

  if (actor.authenticated) return actor;

  if (!status.ownerTokenConfigured && process.env.VERCEL && process.env.HERMEST_ENABLE_DEMO_STORAGE !== "1" && !isDurableStorageEnabled()) {
    return actor;
  }

  const authConfigured = status.ownerTokenConfigured || status.session.secretConfigured;
  const error = new Error(authConfigured ? "unauthorized" : "write_auth_not_configured");
  error.status = authConfigured ? 401 : 501;
  error.code = authConfigured ? "unauthorized" : "write_auth_not_configured";
  error.auth = status;
  error.note = authConfigured
    ? "Write routes require a valid signed session or owner token."
    : "Server-backed writes on public hosting require HERMEST_OWNER_TOKEN or HERMEST_SESSION_SECRET.";
  throw error;
}

export function requireOwnerToken(request) {
  const status = getAuthStatus();
  const actor = getRequestActor(request);

  if (actor.authenticated && actor.mode === "owner-token") return actor;

  const error = new Error(status.ownerTokenConfigured ? "unauthorized" : "owner_token_not_configured");
  error.status = status.ownerTokenConfigured ? 401 : 501;
  error.code = status.ownerTokenConfigured ? "unauthorized" : "owner_token_not_configured";
  error.auth = status;
  error.note = status.ownerTokenConfigured
    ? "This bootstrap route requires Authorization: Bearer <owner token>."
    : "This bootstrap route requires HERMEST_OWNER_TOKEN before it can issue signed session tokens.";
  throw error;
}

function isDurableStorageEnabled() {
  const adapter = String(process.env.HERMEST_STORAGE_ADAPTER || "").trim().toLowerCase();
  const databaseConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  return adapter === "postgres" && databaseConfigured && process.env.HERMEST_ENABLE_DURABLE_STORAGE === "1";
}

function readToken(request) {
  const headers = request.headers || {};
  const auth = header(headers, "authorization");
  if (auth?.toLowerCase().startsWith("bearer hermest.v1.")) return "";
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return header(headers, "x-hermest-owner-token") || "";
}

function header(headers, name) {
  if (typeof headers.get === "function") return headers.get(name) || "";
  return headers[name] || headers[name.toLowerCase()] || "";
}

function tokenMatches(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  if (!actualBuffer.length || actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
