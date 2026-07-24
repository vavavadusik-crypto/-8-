export async function readJson(request) {
  if (!request.body) return {};
  if (typeof request.body === "object") return request.body;
  if (typeof request.body === "string") {
    const text = request.body.trim();
    return text ? JSON.parse(text) : {};
  }
  return {};
}

export function sendJson(response, status, payload) {
  response.status(status).json(payload);
}

export function methodNotAllowed(response, methods) {
  response.setHeader("Allow", methods.join(", "));
  sendJson(response, 405, { ok: false, error: "method_not_allowed", methods });
}

export function handleApiError(response, error) {
  const status = Number(error?.status || 500);
  const message = error?.code || error?.message || "internal_error";

  // Redact secrets from error messages
  const sanitized = sanitizeErrorMessage(message);

  sendJson(response, status, {
    ok: false,
    error: sanitized,
    note: error?.note ? sanitizeErrorMessage(error.note) : undefined,
    auth: error?.auth || undefined,
    storage: error?.storage || undefined,
    accountAuth: error?.accountAuth || undefined
  });
}

function sanitizeErrorMessage(message) {
  if (typeof message !== "string") return message;

  return message
    .replace(/sk-proj-[a-zA-Z0-9_-]+/g, "[REDACTED_KEY]")
    .replace(/sk-[a-zA-Z0-9_-]{20,}/g, "[REDACTED_KEY]")
    .replace(/Bearer\s+[a-zA-Z0-9_.-]{20,}/gi, "Bearer [REDACTED]")
    .replace(/api[_-]?key[:\s=]+["']?[a-zA-Z0-9_-]{8,}["']?/gi, "api_key=[REDACTED]")
    .replace(/\b([A-Z_]+(?:API_KEY|_KEY|_SECRET))[=:\s]+["']?[^\s"']{8,}["']?/gi, "$1=[REDACTED]")
    .slice(0, 1200);
}

export function requireMethods(request, response, methods) {
  if (methods.includes(request.method)) return true;
  methodNotAllowed(response, methods);
  return false;
}
