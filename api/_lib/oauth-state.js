import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const STATE_PREFIX = "hermest.oauth.v1";

export function getOAuthStateStatus() {
  return {
    stateSigningImplemented: true,
    stateSecretConfigured: Boolean(stateSecret())
  };
}

export function createOAuthState(payload = {}) {
  const secret = stateSecret();
  if (!secret) {
    const error = new Error("oauth_state_secret_not_configured");
    error.status = 501;
    error.code = "oauth_state_secret_not_configured";
    error.note = "Set HERMEST_OAUTH_STATE_SECRET or HERMEST_SESSION_SECRET before starting OAuth.";
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  const body = {
    provider: safeProvider(payload.provider),
    workspaceId: safeId(payload.workspaceId) || "",
    nonce: randomUUID(),
    iat: now,
    exp: now + clampTtlSeconds(payload.ttlSeconds)
  };
  const encoded = base64UrlEncode(JSON.stringify(body));
  return `${STATE_PREFIX}.${encoded}.${sign(encoded, secret)}`;
}

export function verifyOAuthState(state, options = {}) {
  const secret = stateSecret();
  if (!secret) {
    return {
      ok: false,
      status: 501,
      error: "oauth_state_secret_not_configured"
    };
  }

  const parts = String(state || "").split(".");
  if (parts.length !== 5 || parts.slice(0, 3).join(".") !== STATE_PREFIX) {
    return invalidState();
  }

  const encoded = parts[3];
  const signature = parts[4];
  if (!safeEqual(signature, sign(encoded, secret))) return invalidState();

  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(encoded));
  } catch (_) {
    return invalidState();
  }

  const now = Math.floor(Date.now() / 1000);
  if (!safeProvider(payload.provider)) return invalidState();
  if (options.provider && payload.provider !== options.provider) return invalidState();
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= now) return invalidState();
  if (payload.iat && Number(payload.iat) > now + 60) return invalidState();

  return {
    ok: true,
    payload
  };
}

function stateSecret() {
  return process.env.HERMEST_OAUTH_STATE_SECRET || process.env.HERMEST_SESSION_SECRET || "";
}

function invalidState() {
  return {
    ok: false,
    status: 400,
    error: "invalid_oauth_state"
  };
}

function sign(encodedPayload, secret) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  if (!actualBuffer.length || actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function base64UrlEncode(value) {
  return Buffer.from(String(value)).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value), "base64url").toString("utf8");
}

function safeProvider(value) {
  const provider = String(value || "").trim();
  return /^(youtube|tiktok|instagram)$/.test(provider) ? provider : "";
}

function safeId(value) {
  const id = String(value || "").trim();
  return /^[a-z0-9_-]{2,120}$/i.test(id) ? id : "";
}

function clampTtlSeconds(value) {
  const ttl = Number(value || 600);
  if (!Number.isFinite(ttl)) return 600;
  return Math.max(60, Math.min(Math.floor(ttl), 3600));
}
