// Charset note: token/bearer patterns include base64 chars (+ / =) so real
// base64/base64url secrets do not slip through. Field allowlist + these entropy
// patterns are intentional; short/non-listed secrets are NOT force-redacted to
// avoid false positives (accepted trade-off, Phase 8 round 2).
const API_KEY_PATTERNS = [
  /sk-proj-[a-zA-Z0-9_-]+/g,
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /Bearer\s+[A-Za-z0-9_.+/=-]{20,}/gi,
  /api[_-]?key[:\s=]+["']?[a-zA-Z0-9_-]{8,}["']?/gi,
  /token[:\s=]+["']?[A-Za-z0-9_.+/=-]{20,}["']?/gi,
  /fal_[a-zA-Z0-9_-]{8,}/gi,
  /elevenlabs_[a-zA-Z0-9_-]{8,}/gi
];

const ENV_SECRET_PATTERN = /\b([A-Z_]+(?:API_KEY|_KEY|_SECRET))[=:\s]+["']?([^\s"']{8,})["']?/gi;

// Field names whose VALUE is always a secret regardless of shape.
const SECRET_FIELDS = new Set([
  "apikey", "api_key", "token", "secret", "password", "passwd",
  "authorization", "auth", "credential", "credentials",
  "accesstoken", "access_token", "refreshtoken", "refresh_token", "clientsecret", "client_secret"
]);

const MAX_DEPTH = 6;

function maskSecrets(text) {
  let masked = text.replace(ENV_SECRET_PATTERN, "$1=[REDACTED]");
  for (const pattern of API_KEY_PATTERNS) {
    masked = masked.replace(pattern, "[REDACTED_SECRET]");
  }
  return masked;
}

export function sanitizeError(error) {
  if (!error) return "unknown_error";

  const message = typeof error === "string"
    ? error
    : (error?.message || error?.code || String(error));

  return maskSecrets(message).slice(0, 1200);
}

// Recursively redact secrets in log context: secret-named fields are masked
// wholesale, string values are scrubbed for secret patterns, and nested
// objects/arrays are walked with a depth cap and a cycle guard so a hostile or
// self-referential payload cannot leak nested keys or exhaust the stack.
export function sanitizeLogContext(context) {
  return sanitizeValue(context, 0, new WeakSet());
}

function isSecretField(key) {
  return SECRET_FIELDS.has(String(key).toLowerCase());
}

function sanitizeValue(value, depth, seen) {
  if (typeof value === "string") return maskSecrets(value);
  if (value === null || typeof value !== "object") return value;

  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);

  let result;
  if (Array.isArray(value)) {
    result = value.map(item => sanitizeValue(item, depth + 1, seen));
  } else {
    result = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = isSecretField(key) ? "[REDACTED]" : sanitizeValue(item, depth + 1, seen);
    }
  }

  seen.delete(value);
  return result;
}
