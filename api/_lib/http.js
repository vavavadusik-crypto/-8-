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
  sendJson(response, status, {
    ok: false,
    error: error?.code || error?.message || "internal_error",
    note: error?.note || undefined,
    auth: error?.auth || undefined,
    storage: error?.storage || undefined
  });
}

export function requireMethods(request, response, methods) {
  if (methods.includes(request.method)) return true;
  methodNotAllowed(response, methods);
  return false;
}
