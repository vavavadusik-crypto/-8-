import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "hermest.v1";

export function getSessionStatus() {
  return {
    secretConfigured: Boolean(process.env.HERMEST_SESSION_SECRET),
    verifierImplemented: true,
    issuerImplemented: true,
    ownerTokenBootstrapIssuerAvailable: Boolean(process.env.HERMEST_SESSION_SECRET && process.env.HERMEST_OWNER_TOKEN),
    cookieName: "hermest_session"
  };
}

export function readSignedSession(request) {
  const secret = process.env.HERMEST_SESSION_SECRET;
  if (!secret) return null;

  const token = readSessionToken(request);
  if (!token) return null;

  const payload = verifySignedSessionToken(token, secret);
  if (!payload) return null;

  return {
    authenticated: true,
    id: safeId(payload.sub) || "user",
    workspaceId: safeId(payload.workspaceId) || "workspace",
    mode: "signed-session",
    session: {
      issuedAt: isoFromUnix(payload.iat),
      expiresAt: isoFromUnix(payload.exp)
    }
  };
}

export function createSignedSessionToken(payload, secret = process.env.HERMEST_SESSION_SECRET) {
  if (!secret) throw new Error("session_secret_not_configured");
  const now = Math.floor(Date.now() / 1000);
  const body = {
    sub: safeId(payload.sub || payload.userId) || "user",
    workspaceId: safeId(payload.workspaceId) || "workspace",
    iat: Number(payload.iat || now),
    exp: Number(payload.exp || now + 3600)
  };
  const encoded = base64UrlEncode(JSON.stringify(body));
  return `${TOKEN_PREFIX}.${encoded}.${sign(encoded, secret)}`;
}

function verifySignedSessionToken(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 4 || `${parts[0]}.${parts[1]}` !== TOKEN_PREFIX) return null;

  const encoded = parts[2];
  const signature = parts[3];
  if (!safeEqual(signature, sign(encoded, secret))) return null;

  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(encoded));
  } catch (_) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (!safeId(payload.sub || payload.userId)) return null;
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= now) return null;
  if (payload.iat && Number(payload.iat) > now + 60) return null;
  return payload;
}

function readSessionToken(request) {
  const headers = request.headers || {};
  const auth = header(headers, "authorization");
  if (auth?.toLowerCase().startsWith("bearer hermest.v1.")) return auth.slice(7).trim();

  const cookie = header(headers, "cookie");
  const match = cookie.match(/(?:^|;\s*)hermest_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function header(headers, name) {
  if (typeof headers.get === "function") return headers.get(name) || "";
  return headers[name] || headers[name.toLowerCase()] || "";
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

function safeId(value) {
  const id = String(value || "").trim();
  return /^[a-z0-9_-]{2,120}$/i.test(id) ? id : "";
}

function isoFromUnix(value) {
  const number = Number(value);
  return Number.isFinite(number) ? new Date(number * 1000).toISOString() : null;
}
