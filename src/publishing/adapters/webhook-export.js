/**
 * Webhook/Export Publishing Adapter
 *
 * Safe, testable adapter with NO OAuth dependency.
 * POSTs publish-pack or signed manifest to user-configured URL.
 *
 * Features:
 * - Idempotent via idempotencyKey
 * - Retry on safe errors (5xx, network) with exponential backoff
 * - Rate limit (429) handling
 * - AbortSignal cancellation
 * - No SSRF — validates URLs (no localhost/private IPs)
 * - Sanitized errors (no tokens in receipts)
 */

import { createHash } from "node:crypto";
import { buildReceipt, sanitizeError, validatePublishOptions } from "../publish-contract.js";

const ADAPTER_ID = "webhook-export-v1";
const PLATFORM = "webhook_export";
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;

// SSRF protection: block localhost and private IPs
const FORBIDDEN_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "::",
  "169.254.169.254" // AWS metadata endpoint
];

const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^fc00:/,
  /^fd00:/
];

/**
 * Creates webhook-export adapter instance.
 *
 * @param {object} config - Adapter configuration
 * @param {string} config.webhookUrl - Target webhook URL
 * @param {object} [config.headers] - Optional custom headers
 * @param {Function} [config.fetchFn] - Optional fetch override (for testing)
 * @returns {object} Adapter instance
 */
export function createWebhookExportAdapter(config = {}) {
  const webhookUrl = validateWebhookUrl(config.webhookUrl);
  const headers = config.headers && typeof config.headers === "object" ? config.headers : {};
  const fetchFn = config.fetchFn || globalThis.fetch;
  const sleepFn = config.sleepFn || sleep;

  if (!fetchFn || typeof fetchFn !== "function") {
    throw new TypeError("webhook_adapter_fetch_required");
  }

  return {
    platform: PLATFORM,
    capabilities: {
      acceptsManifest: true,
      acceptsPublishPack: true,
      maxRetries: MAX_RETRIES,
      supportsIdempotency: true,
      supportsCancellation: true
    },
    requiresAuth: false,
    costClass: "free",

    validate(candidate) {
      const problems = [];

      if (!candidate || typeof candidate !== "object") {
        problems.push("candidate_required");
      }

      if (!candidate.id || !candidate.id.startsWith("cand_")) {
        problems.push("candidate_id_invalid");
      }

      if (!candidate.digest || !/^[a-f0-9]{64}$/.test(candidate.digest)) {
        problems.push("candidate_digest_invalid");
      }

      if (!Array.isArray(candidate.platforms) || !candidate.platforms.length) {
        problems.push("candidate_platforms_missing");
      }

      if (!Array.isArray(candidate.artifacts) || !candidate.artifacts.length) {
        problems.push("candidate_artifacts_missing");
      }

      return {
        ok: problems.length === 0,
        problems
      };
    },

    async publish(candidate, options) {
      const validated = validatePublishOptions(options);
      const validation = this.validate(candidate);

      if (!validation.ok) {
        throw new Error(`webhook_validation_failed: ${validation.problems.join(", ")}`);
      }

      const payload = buildPayload(candidate, validated.mode);
      const receiptId = `receipt_webhook_${createHash("sha256").update(validated.idempotencyKey).digest("hex").slice(0, 24)}`;

      try {
        const response = await fetchWithRetry({
          url: webhookUrl,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hermest-Idempotency-Key": validated.idempotencyKey,
            "X-Hermest-Mode": validated.mode,
            "X-Hermest-Candidate-Id": candidate.id,
            "X-Hermest-Candidate-Digest": candidate.digest,
            ...headers
          },
          body: JSON.stringify(payload),
          signal: validated.signal,
          fetchFn,
          sleepFn
        });

        const remoteId = response.headers.get("X-Remote-Id") || undefined;
        const remoteUrl = response.headers.get("X-Remote-Url") || undefined;

        return buildReceipt({
          id: receiptId,
          candidateId: candidate.id,
          candidateDigest: candidate.digest,
          platform: PLATFORM,
          mode: validated.mode,
          status: "success",
          idempotencyKey: validated.idempotencyKey,
          remoteId,
          url: remoteUrl,
          metadata: {
            statusCode: response.status
          }
        });
      } catch (error) {
        if (error.name === "AbortError") {
          return buildReceipt({
            id: receiptId,
            candidateId: candidate.id,
            candidateDigest: candidate.digest,
            platform: PLATFORM,
            mode: validated.mode,
            status: "failed",
            idempotencyKey: validated.idempotencyKey,
            sanitizedError: "Publish cancelled by user"
          });
        }

        return buildReceipt({
          id: receiptId,
          candidateId: candidate.id,
          candidateDigest: candidate.digest,
          platform: PLATFORM,
          mode: validated.mode,
          status: "failed",
          idempotencyKey: validated.idempotencyKey,
          sanitizedError: sanitizeError(error)
        });
      }
    }
  };
}

/**
 * Validates webhook URL (SSRF protection).
 *
 * @param {string} url - URL to validate
 * @returns {string} Validated URL
 * @throws {TypeError} if URL is invalid or forbidden
 */
function validateWebhookUrl(url) {
  const urlString = String(url || "").trim();

  if (!urlString) {
    throw new TypeError("webhook_url_required");
  }

  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new TypeError("webhook_url_invalid");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new TypeError("webhook_url_must_be_http_or_https");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (FORBIDDEN_HOSTS.includes(hostname)) {
    throw new TypeError("webhook_url_localhost_forbidden");
  }

  if (PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname))) {
    throw new TypeError("webhook_url_private_ip_forbidden");
  }

  return urlString;
}

/**
 * Sanitizes URL for logging (removes query params, keeps domain).
 *
 * @param {string} url - URL to sanitize
 * @returns {string} Sanitized URL
 */
function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "<invalid-url>";
  }
}

/**
 * Builds payload for webhook.
 *
 * @param {object} candidate - Publish candidate
 * @param {string} mode - Publish mode
 * @returns {object} Payload
 */
function buildPayload(candidate, mode) {
  return {
    schema: "hermest.webhook.payload.v1",
    mode,
    candidate: {
      id: candidate.id,
      digest: candidate.digest,
      projectId: candidate.projectId,
      platforms: candidate.platforms,
      recipe: candidate.recipe,
      artifacts: candidate.artifacts,
      manifestSha256: candidate.manifestSha256
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Fetches with retry logic (exponential backoff).
 *
 * @param {object} options - Fetch options
 * @returns {Response} Response
 * @throws {Error} if all retries fail
 */
async function fetchWithRetry(options) {
  const { url, method, headers, body, signal, fetchFn, sleepFn = sleep } = options;
  let lastError;
  let backoffMs = INITIAL_BACKOFF_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      // Combine user signal with timeout signal
      if (signal?.aborted) {
        const error = new Error("Aborted");
        error.name = "AbortError";
        throw error;
      }

      const abortHandler = signal
        ? () => controller.abort()
        : null;

      if (abortHandler) {
        signal.addEventListener("abort", abortHandler, { once: true });
      }

      try {
        const response = await fetchFn(url, {
          method,
          headers,
          body,
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (abortHandler) {
          signal.removeEventListener("abort", abortHandler);
        }

        // Success
        if (response.ok) {
          return response;
        }

        // Rate limit — backoff and retry
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoffMs;
          lastError = new Error(`Rate limited (429), retry after ${retryMs}ms`);

          if (attempt < MAX_RETRIES) {
            await sleepFn(Math.min(retryMs, MAX_BACKOFF_MS));
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            continue;
          }
        }

        // Server error (5xx) — retry
        if (response.status >= 500) {
          lastError = new Error(`Server error ${response.status}`);

          if (attempt < MAX_RETRIES) {
            await sleepFn(backoffMs);
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            continue;
          }
        }

        // Client error (4xx except 429) — do NOT retry
        const responseText = await response.text().catch(() => "");
        const clientError = new Error(`HTTP ${response.status}: ${responseText.slice(0, 200)}`);
        clientError.isClientError = true;
        throw clientError;

      } finally {
        clearTimeout(timeoutId);
        if (abortHandler) {
          signal.removeEventListener("abort", abortHandler);
        }
      }

    } catch (error) {
      // AbortError — propagate immediately
      if (error.name === "AbortError") {
        throw error;
      }

      // Client HTTP error (4xx) — do NOT retry
      if (error.isClientError) {
        throw error;
      }

      // Network error or timeout — retry
      lastError = error;

      if (attempt < MAX_RETRIES) {
        await sleepFn(backoffMs);
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        continue;
      }
    }
  }

  throw lastError || new Error("webhook_publish_failed_after_retries");
}

/**
 * Sleep for given milliseconds.
 *
 * @param {number} ms - Milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
