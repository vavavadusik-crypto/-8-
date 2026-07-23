/**
 * General publishing contract for all platform adapters.
 *
 * Schema: hermest.publish.contract.v1
 *
 * An adapter implements:
 * - platform: string — platform ID (e.g. "youtube_video", "webhook_export")
 * - capabilities: object — platform constraints (validation rules)
 * - validate(candidate) => { ok, problems[] } — pre-publish validation
 * - requiresAuth: boolean — does this need OAuth?
 * - costClass: "free" | "metered" | "quota" — cost classification
 * - publish(candidate, options) => receipt — execute publish
 *
 * Receipt schema:
 * {
 *   schema: "hermest.publish.receipt.v1",
 *   id: string,
 *   candidateId: string,
 *   candidateDigest: string,
 *   platform: string,
 *   mode: "draft" | "live",
 *   status: "success" | "failed" | "pending",
 *   remoteId?: string,
 *   url?: string,
 *   timestamp: string (ISO 8601),
 *   idempotencyKey: string,
 *   sanitizedError?: string,
 *   metadata?: object
 * }
 *
 * Publish options:
 * {
 *   mode: "draft" | "live",
 *   idempotencyKey: string,
 *   signal?: AbortSignal
 * }
 */

const RECEIPT_SCHEMA = "hermest.publish.receipt.v1";
const PUBLISH_MODES = new Set(["draft", "live"]);
const RECEIPT_STATUSES = new Set(["success", "failed", "pending"]);
const COST_CLASSES = new Set(["free", "metered", "quota"]);

/**
 * Validates that an adapter conforms to the publishing contract.
 *
 * @param {object} adapter - Adapter implementation
 * @throws {TypeError} if adapter is invalid
 */
export function validateAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("adapter_required");
  }

  const required = ["platform", "capabilities", "validate", "requiresAuth", "costClass", "publish"];
  for (const field of required) {
    if (!(field in adapter)) {
      throw new TypeError(`adapter_missing_${field}`);
    }
  }

  if (typeof adapter.platform !== "string" || !adapter.platform.trim()) {
    throw new TypeError("adapter_platform_must_be_nonempty_string");
  }

  if (typeof adapter.capabilities !== "object" || adapter.capabilities === null) {
    throw new TypeError("adapter_capabilities_must_be_object");
  }

  if (typeof adapter.validate !== "function") {
    throw new TypeError("adapter_validate_must_be_function");
  }

  if (typeof adapter.requiresAuth !== "boolean") {
    throw new TypeError("adapter_requires_auth_must_be_boolean");
  }

  if (!COST_CLASSES.has(adapter.costClass)) {
    throw new TypeError("adapter_cost_class_must_be_free_metered_or_quota");
  }

  if (typeof adapter.publish !== "function") {
    throw new TypeError("adapter_publish_must_be_function");
  }
}

/**
 * Validates publish options.
 *
 * @param {object} options - Publish options
 * @returns {{ mode: string, idempotencyKey: string, signal?: AbortSignal }}
 * @throws {TypeError} if options are invalid
 */
export function validatePublishOptions(options = {}) {
  if (!options || typeof options !== "object") {
    throw new TypeError("publish_options_required");
  }

  const mode = String(options.mode || "draft").trim();
  if (!PUBLISH_MODES.has(mode)) {
    throw new TypeError("publish_mode_must_be_draft_or_live");
  }

  // Fail-closed guard (master-prompt §PHASE 3 req 5): реальная публикация
  // требует явного подтверждения. Draft — безопасный дефолт, confirm не нужен.
  if (mode === "live" && options.confirm !== true) {
    throw new TypeError("live_publish_requires_explicit_confirm");
  }
  const confirm = mode === "live";

  const idempotencyKey = String(options.idempotencyKey || "").trim();
  if (!idempotencyKey || !/^[a-z0-9_-]{8,128}$/i.test(idempotencyKey)) {
    throw new TypeError("publish_idempotency_key_required_8_to_128_chars");
  }

  const signal = options.signal;
  if (signal !== undefined && signal !== null && typeof signal.aborted !== "boolean") {
    throw new TypeError("publish_signal_must_be_abort_signal_or_undefined");
  }

  return { mode, idempotencyKey, signal, confirm };
}

/**
 * Validates a publish receipt.
 *
 * @param {object} receipt - Receipt object
 * @throws {TypeError} if receipt is invalid
 */
export function validateReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") {
    throw new TypeError("receipt_required");
  }

  if (receipt.schema !== RECEIPT_SCHEMA) {
    throw new TypeError(`receipt_schema_mismatch_expected_${RECEIPT_SCHEMA}`);
  }

  const required = ["id", "candidateId", "candidateDigest", "platform", "mode", "status", "timestamp", "idempotencyKey"];
  for (const field of required) {
    if (!(field in receipt)) {
      throw new TypeError(`receipt_missing_${field}`);
    }
  }

  if (typeof receipt.id !== "string" || !/^[a-z0-9_-]{8,128}$/i.test(receipt.id)) {
    throw new TypeError("receipt_id_must_be_8_to_128_chars");
  }

  if (typeof receipt.candidateId !== "string" || !receipt.candidateId.startsWith("cand_")) {
    throw new TypeError("receipt_candidate_id_must_start_with_cand_");
  }

  if (typeof receipt.candidateDigest !== "string" || !/^[a-f0-9]{64}$/i.test(receipt.candidateDigest)) {
    throw new TypeError("receipt_candidate_digest_must_be_sha256");
  }

  if (typeof receipt.platform !== "string" || !receipt.platform.trim()) {
    throw new TypeError("receipt_platform_must_be_nonempty_string");
  }

  if (!PUBLISH_MODES.has(receipt.mode)) {
    throw new TypeError("receipt_mode_must_be_draft_or_live");
  }

  if (!RECEIPT_STATUSES.has(receipt.status)) {
    throw new TypeError("receipt_status_must_be_success_failed_or_pending");
  }

  if (typeof receipt.timestamp !== "string") {
    throw new TypeError("receipt_timestamp_must_be_iso8601_string");
  }

  const timestamp = new Date(receipt.timestamp);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new TypeError("receipt_timestamp_must_be_valid_iso8601");
  }

  if (typeof receipt.idempotencyKey !== "string" || !/^[a-z0-9_-]{8,128}$/i.test(receipt.idempotencyKey)) {
    throw new TypeError("receipt_idempotency_key_must_be_8_to_128_chars");
  }

  if (receipt.remoteId !== undefined && typeof receipt.remoteId !== "string") {
    throw new TypeError("receipt_remote_id_must_be_string_or_undefined");
  }

  if (receipt.url !== undefined && typeof receipt.url !== "string") {
    throw new TypeError("receipt_url_must_be_string_or_undefined");
  }

  if (receipt.sanitizedError !== undefined && typeof receipt.sanitizedError !== "string") {
    throw new TypeError("receipt_sanitized_error_must_be_string_or_undefined");
  }

  if (receipt.metadata !== undefined && (typeof receipt.metadata !== "object" || receipt.metadata === null || Array.isArray(receipt.metadata))) {
    throw new TypeError("receipt_metadata_must_be_object_or_undefined");
  }

  // Security: no secrets in receipt
  const receiptString = JSON.stringify(receipt);

  // Strip known placeholder patterns before checking for secrets
  const sanitizedString = receiptString
    .replace(/api[_-]?key[=:]\s*REDACTED/gi, "")
    .replace(/access[_-]?token[=:]\s*REDACTED/gi, "")
    .replace(/refresh[_-]?token[=:]\s*REDACTED/gi, "")
    .replace(/token[=:]\s*REDACTED/gi, "")
    .replace(/password[=:]\s*REDACTED/gi, "")
    .replace(/Bearer\s+REDACTED/gi, "");

  const secretPatterns = [
    /api[_-]?key[=:]\s*[^\s"]+/i,
    /access[_-]?token[=:]\s*[^\s"]+/i,
    /refresh[_-]?token[=:]\s*[^\s"]+/i,
    /client[_-]?secret[=:]\s*[^\s"]+/i,
    /password[=:]\s*[^\s"]+/i,
    /bearer\s+[a-z0-9_-]{20,}/i
  ];

  for (const pattern of secretPatterns) {
    if (pattern.test(sanitizedString)) {
      throw new TypeError("receipt_must_not_contain_secrets_or_tokens");
    }
  }
}

/**
 * Creates a receipt builder with safe defaults.
 *
 * @param {object} params - Receipt parameters
 * @returns {object} Receipt
 */
export function buildReceipt(params = {}) {
  const receipt = {
    schema: RECEIPT_SCHEMA,
    id: safeId(params.id),
    candidateId: safeId(params.candidateId),
    candidateDigest: safeSha256(params.candidateDigest),
    platform: safeText(params.platform, 64),
    mode: safeMode(params.mode),
    status: safeStatus(params.status),
    timestamp: params.timestamp ? new Date(params.timestamp).toISOString() : new Date().toISOString(),
    idempotencyKey: safeId(params.idempotencyKey),
    remoteId: params.remoteId ? safeText(params.remoteId, 256) : undefined,
    url: params.url ? safeUrl(params.url) : undefined,
    sanitizedError: params.sanitizedError ? sanitizeError(params.sanitizedError) : undefined,
    metadata: params.metadata && typeof params.metadata === "object" && !Array.isArray(params.metadata)
      ? sanitizeMetadata(params.metadata)
      : undefined
  };

  validateReceipt(receipt);
  return Object.freeze(receipt);
}

/**
 * Sanitizes an error message for safe storage/display.
 * Removes secrets, tokens, API keys, stack traces, file paths.
 *
 * @param {string | Error} error - Error to sanitize
 * @returns {string} Sanitized error message
 */
export function sanitizeError(error) {
  let message = error instanceof Error ? error.message : String(error || "unknown_error");

  // Remove secrets
  message = message.replace(/api[_-]?key[=:]\s*[^\s]+/gi, "api_key=REDACTED");
  message = message.replace(/token[=:]\s*[^\s]+/gi, "token=REDACTED");
  message = message.replace(/password[=:]\s*[^\s]+/gi, "password=REDACTED");
  message = message.replace(/bearer\s+[a-z0-9_-]{20,}/gi, "Bearer REDACTED");

  // Remove stack traces
  message = message.split("\n")[0];

  // Remove file paths
  message = message.replace(/\/[^\s]+\.(js|mjs|ts|tsx)/g, "<file>");

  return message.slice(0, 500);
}

/**
 * Sanitizes metadata object (removes secrets, limits depth).
 *
 * @param {object} metadata - Metadata to sanitize
 * @returns {object} Sanitized metadata
 */
function sanitizeMetadata(metadata) {
  const sanitized = {};
  const keys = Object.keys(metadata).slice(0, 32);

  for (const key of keys) {
    const value = metadata[key];
    const keyLower = key.toLowerCase();

    // Skip secret keys
    if (/token|key|secret|password|credential/i.test(keyLower)) continue;

    // Safe primitives
    if (typeof value === "string") {
      sanitized[key] = value.slice(0, 1000);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[key] = value;
    } else if (typeof value === "boolean") {
      sanitized[key] = value;
    } else if (value === null) {
      sanitized[key] = null;
    }
    // Skip arrays, objects, functions
  }

  return sanitized;
}

function safeId(value) {
  const id = String(value || "").trim();
  if (!/^[a-z0-9_-]{8,128}$/i.test(id)) {
    throw new TypeError("invalid_id_format");
  }
  return id;
}

function safeSha256(value) {
  const digest = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new TypeError("invalid_sha256_digest");
  }
  return digest;
}

function safeText(value, limit) {
  const text = String(value || "").trim();
  if (!text) {
    throw new TypeError("text_required");
  }
  return text.slice(0, limit);
}

function safeMode(value) {
  const mode = String(value || "draft").trim();
  if (!PUBLISH_MODES.has(mode)) {
    throw new TypeError("invalid_publish_mode");
  }
  return mode;
}

function safeStatus(value) {
  const status = String(value || "pending").trim();
  if (!RECEIPT_STATUSES.has(status)) {
    throw new TypeError("invalid_receipt_status");
  }
  return status;
}

function safeUrl(value) {
  const url = String(value || "").trim();
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new TypeError("url_must_be_http_or_https");
    }
    return url.slice(0, 2048);
  } catch {
    throw new TypeError("invalid_url");
  }
}
