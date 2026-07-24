const API_KEY_PATTERNS = [
  /sk-proj-[a-zA-Z0-9_-]+/g,
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /Bearer\s+[a-zA-Z0-9_.-]{20,}/gi,
  /api[_-]?key[:\s=]+["']?[a-zA-Z0-9_-]{8,}["']?/gi,
  /token[:\s=]+["']?[a-zA-Z0-9_.-]{20,}["']?/gi,
  /fal_[a-zA-Z0-9_-]{8,}/gi,
  /elevenlabs_[a-zA-Z0-9_-]{8,}/gi
];

export function sanitizeError(error) {
  if (!error) return "unknown_error";

  let message = typeof error === "string"
    ? error
    : (error?.message || error?.code || String(error));

  // Redact environment variable values FIRST (before generic patterns)
  // Match patterns like: HERMEST_FAL_API_KEY=secret_value or API_KEY="secret_value"
  message = message.replace(
    /\b([A-Z_]+(?:API_KEY|_KEY|_SECRET))[=:\s]+["']?([^\s"']{8,})["']?/gi,
    "$1=[REDACTED]"
  );

  // Then redact remaining API keys and tokens
  for (const pattern of API_KEY_PATTERNS) {
    message = message.replace(pattern, "[REDACTED_SECRET]");
  }

  return message.slice(0, 1200);
}

export function sanitizeLogContext(context) {
  if (!context || typeof context !== "object") return context;

  const sanitized = { ...context };

  // Redact known secret fields
  const secretFields = ["apiKey", "api_key", "token", "secret", "password", "authorization"];
  for (const field of secretFields) {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  }

  // Redact values that look like secrets
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === "string" && value.length >= 20) {
      for (const pattern of API_KEY_PATTERNS) {
        if (pattern.test(value)) {
          sanitized[key] = "[REDACTED_SECRET]";
          break;
        }
      }
    }
  }

  return sanitized;
}
