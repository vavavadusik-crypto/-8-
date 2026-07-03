import { timingSafeEqual } from "node:crypto";

export function getAuthStatus() {
  const inVercel = Boolean(process.env.VERCEL);
  const demoStorageEnabled = process.env.HERMEST_ENABLE_DEMO_STORAGE === "1";
  const ownerTokenConfigured = Boolean(process.env.HERMEST_OWNER_TOKEN);

  return {
    ok: true,
    mode: ownerTokenConfigured ? "owner-token" : "development-or-readonly",
    ownerTokenConfigured,
    writeAccess: ownerTokenConfigured
      ? "owner_token_required"
      : inVercel && demoStorageEnabled
        ? "blocked_until_owner_token_configured"
        : inVercel
          ? "blocked_by_storage_guard"
          : "local_development_open",
    productionSafe: ownerTokenConfigured || !inVercel || !demoStorageEnabled
  };
}

export function getRequestActor(request) {
  const status = getAuthStatus();
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

  if (!status.ownerTokenConfigured && process.env.VERCEL && process.env.HERMEST_ENABLE_DEMO_STORAGE !== "1") {
    return actor;
  }

  const error = new Error(status.ownerTokenConfigured ? "unauthorized" : "write_auth_not_configured");
  error.status = status.ownerTokenConfigured ? 401 : 501;
  error.code = status.ownerTokenConfigured ? "unauthorized" : "write_auth_not_configured";
  error.auth = status;
  error.note = status.ownerTokenConfigured
    ? "Write routes require Authorization: Bearer <owner token>."
    : "Demo storage writes on public hosting require HERMEST_OWNER_TOKEN.";
  throw error;
}

function readToken(request) {
  const headers = request.headers || {};
  const auth = header(headers, "authorization");
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
