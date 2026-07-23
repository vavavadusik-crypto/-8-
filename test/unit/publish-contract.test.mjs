import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  validateAdapter,
  validatePublishOptions,
  validateReceipt,
  buildReceipt,
  sanitizeError
} from "../../src/publishing/publish-contract.js";

describe("publish-contract", () => {
  describe("validateAdapter", () => {
    it("accepts valid adapter", () => {
      const adapter = {
        platform: "test_platform",
        capabilities: { maxSize: 1000 },
        validate: () => ({ ok: true, problems: [] }),
        requiresAuth: false,
        costClass: "free",
        publish: async () => ({})
      };
      assert.doesNotThrow(() => validateAdapter(adapter));
    });

    it("rejects adapter without platform", () => {
      const adapter = {
        capabilities: {},
        validate: () => ({}),
        requiresAuth: false,
        costClass: "free",
        publish: async () => ({})
      };
      assert.throws(() => validateAdapter(adapter), /adapter_missing_platform/);
    });

    it("rejects adapter with empty platform", () => {
      const adapter = {
        platform: "",
        capabilities: {},
        validate: () => ({}),
        requiresAuth: false,
        costClass: "free",
        publish: async () => ({})
      };
      assert.throws(() => validateAdapter(adapter), /adapter_platform_must_be_nonempty_string/);
    });

    it("rejects adapter without capabilities", () => {
      const adapter = {
        platform: "test",
        validate: () => ({}),
        requiresAuth: false,
        costClass: "free",
        publish: async () => ({})
      };
      assert.throws(() => validateAdapter(adapter), /adapter_missing_capabilities/);
    });

    it("rejects adapter with invalid costClass", () => {
      const adapter = {
        platform: "test",
        capabilities: {},
        validate: () => ({}),
        requiresAuth: false,
        costClass: "invalid",
        publish: async () => ({})
      };
      assert.throws(() => validateAdapter(adapter), /adapter_cost_class_must_be_free_metered_or_quota/);
    });

    it("rejects adapter with non-function validate", () => {
      const adapter = {
        platform: "test",
        capabilities: {},
        validate: "not a function",
        requiresAuth: false,
        costClass: "free",
        publish: async () => ({})
      };
      assert.throws(() => validateAdapter(adapter), /adapter_validate_must_be_function/);
    });

    it("rejects adapter with non-boolean requiresAuth", () => {
      const adapter = {
        platform: "test",
        capabilities: {},
        validate: () => ({}),
        requiresAuth: "yes",
        costClass: "free",
        publish: async () => ({})
      };
      assert.throws(() => validateAdapter(adapter), /adapter_requires_auth_must_be_boolean/);
    });

    it("rejects adapter with non-function publish", () => {
      const adapter = {
        platform: "test",
        capabilities: {},
        validate: () => ({}),
        requiresAuth: false,
        costClass: "free",
        publish: null
      };
      assert.throws(() => validateAdapter(adapter), /adapter_publish_must_be_function/);
    });
  });

  describe("validatePublishOptions", () => {
    it("accepts valid draft options", () => {
      const options = { mode: "draft", idempotencyKey: "test_key_12345678" };
      const validated = validatePublishOptions(options);
      assert.strictEqual(validated.mode, "draft");
      assert.strictEqual(validated.idempotencyKey, "test_key_12345678");
    });

    it("accepts valid live options", () => {
      const options = { mode: "live", idempotencyKey: "live_key_87654321" };
      const validated = validatePublishOptions(options);
      assert.strictEqual(validated.mode, "live");
    });

    it("defaults to draft mode", () => {
      const options = { idempotencyKey: "default_mode_key" };
      const validated = validatePublishOptions(options);
      assert.strictEqual(validated.mode, "draft");
    });

    it("rejects invalid mode", () => {
      const options = { mode: "invalid", idempotencyKey: "test_key_12345678" };
      assert.throws(() => validatePublishOptions(options), /publish_mode_must_be_draft_or_live/);
    });

    it("rejects missing idempotencyKey", () => {
      const options = { mode: "draft" };
      assert.throws(() => validatePublishOptions(options), /publish_idempotency_key_required/);
    });

    it("rejects short idempotencyKey", () => {
      const options = { mode: "draft", idempotencyKey: "short" };
      assert.throws(() => validatePublishOptions(options), /publish_idempotency_key_required_8_to_128_chars/);
    });

    it("rejects idempotencyKey with invalid characters", () => {
      const options = { mode: "draft", idempotencyKey: "invalid key with spaces" };
      assert.throws(() => validatePublishOptions(options), /publish_idempotency_key_required_8_to_128_chars/);
    });

    it("accepts AbortSignal", () => {
      const controller = new AbortController();
      const options = { mode: "draft", idempotencyKey: "abort_test_key", signal: controller.signal };
      const validated = validatePublishOptions(options);
      assert.strictEqual(validated.signal, controller.signal);
    });

    it("rejects invalid signal", () => {
      const options = { mode: "draft", idempotencyKey: "invalid_signal", signal: { not: "a signal" } };
      assert.throws(() => validatePublishOptions(options), /publish_signal_must_be_abort_signal_or_undefined/);
    });
  });

  describe("validateReceipt", () => {
    it("accepts valid receipt", () => {
      const receipt = {
        schema: "hermest.publish.receipt.v1",
        id: "receipt_12345678",
        candidateId: "cand_abc123",
        candidateDigest: "a".repeat(64),
        platform: "test_platform",
        mode: "draft",
        status: "success",
        timestamp: new Date().toISOString(),
        idempotencyKey: "idempotency_key_123"
      };
      assert.doesNotThrow(() => validateReceipt(receipt));
    });

    it("rejects receipt with wrong schema", () => {
      const receipt = {
        schema: "wrong.schema.v1",
        id: "receipt_12345678",
        candidateId: "cand_abc123",
        candidateDigest: "a".repeat(64),
        platform: "test",
        mode: "draft",
        status: "success",
        timestamp: new Date().toISOString(),
        idempotencyKey: "key_12345678"
      };
      assert.throws(() => validateReceipt(receipt), /receipt_schema_mismatch/);
    });

    it("rejects receipt without candidateId", () => {
      const receipt = {
        schema: "hermest.publish.receipt.v1",
        id: "receipt_12345678",
        candidateDigest: "a".repeat(64),
        platform: "test",
        mode: "draft",
        status: "success",
        timestamp: new Date().toISOString(),
        idempotencyKey: "key_12345678"
      };
      assert.throws(() => validateReceipt(receipt), /receipt_missing_candidateId/);
    });

    it("rejects receipt with invalid candidateId", () => {
      const receipt = {
        schema: "hermest.publish.receipt.v1",
        id: "receipt_12345678",
        candidateId: "invalid_prefix",
        candidateDigest: "a".repeat(64),
        platform: "test",
        mode: "draft",
        status: "success",
        timestamp: new Date().toISOString(),
        idempotencyKey: "key_12345678"
      };
      assert.throws(() => validateReceipt(receipt), /receipt_candidate_id_must_start_with_cand_/);
    });

    it("rejects receipt with invalid candidateDigest", () => {
      const receipt = {
        schema: "hermest.publish.receipt.v1",
        id: "receipt_12345678",
        candidateId: "cand_abc123",
        candidateDigest: "not_a_sha256",
        platform: "test",
        mode: "draft",
        status: "success",
        timestamp: new Date().toISOString(),
        idempotencyKey: "key_12345678"
      };
      assert.throws(() => validateReceipt(receipt), /receipt_candidate_digest_must_be_sha256/);
    });

    it("rejects receipt with invalid timestamp", () => {
      const receipt = {
        schema: "hermest.publish.receipt.v1",
        id: "receipt_12345678",
        candidateId: "cand_abc123",
        candidateDigest: "a".repeat(64),
        platform: "test",
        mode: "draft",
        status: "success",
        timestamp: "not a date",
        idempotencyKey: "key_12345678"
      };
      assert.throws(() => validateReceipt(receipt), /receipt_timestamp_must_be_valid_iso8601/);
    });

    it("rejects receipt with secrets in sanitizedError", () => {
      const receipt = {
        schema: "hermest.publish.receipt.v1",
        id: "receipt_12345678",
        candidateId: "cand_abc123",
        candidateDigest: "a".repeat(64),
        platform: "test",
        mode: "draft",
        status: "failed",
        timestamp: new Date().toISOString(),
        idempotencyKey: "key_12345678",
        sanitizedError: "API error: access_token=sk_live_super_secret_key"
      };
      assert.throws(() => validateReceipt(receipt), /receipt_must_not_contain_secrets_or_tokens/);
    });

    it("accepts receipt with sanitized error", () => {
      const receipt = {
        schema: "hermest.publish.receipt.v1",
        id: "receipt_12345678",
        candidateId: "cand_abc123",
        candidateDigest: "a".repeat(64),
        platform: "test",
        mode: "draft",
        status: "failed",
        timestamp: new Date().toISOString(),
        idempotencyKey: "key_12345678",
        sanitizedError: "Rate limit exceeded"
      };
      assert.doesNotThrow(() => validateReceipt(receipt));
    });

    it("accepts receipt with optional fields", () => {
      const receipt = {
        schema: "hermest.publish.receipt.v1",
        id: "receipt_12345678",
        candidateId: "cand_abc123",
        candidateDigest: "a".repeat(64),
        platform: "test",
        mode: "draft",
        status: "success",
        timestamp: new Date().toISOString(),
        idempotencyKey: "key_12345678",
        remoteId: "youtube_video_id_123",
        url: "https://youtube.com/watch?v=123",
        metadata: { duration: 120, aspectRatio: "16:9" }
      };
      assert.doesNotThrow(() => validateReceipt(receipt));
    });
  });

  describe("buildReceipt", () => {
    it("builds valid receipt with required fields", () => {
      const receipt = buildReceipt({
        id: "receipt_12345678",
        candidateId: "cand_test_123",
        candidateDigest: "b".repeat(64),
        platform: "webhook_export",
        mode: "draft",
        status: "success",
        idempotencyKey: "build_test_key"
      });

      assert.strictEqual(receipt.schema, "hermest.publish.receipt.v1");
      assert.strictEqual(receipt.platform, "webhook_export");
      assert.strictEqual(receipt.mode, "draft");
      assert.strictEqual(receipt.status, "success");
      assert.ok(Object.isFrozen(receipt));
    });

    it("auto-generates timestamp if not provided", () => {
      const before = new Date().toISOString();
      const receipt = buildReceipt({
        id: "receipt_auto_ts",
        candidateId: "cand_test_456",
        candidateDigest: "c".repeat(64),
        platform: "test",
        mode: "draft",
        status: "pending",
        idempotencyKey: "auto_ts_key"
      });
      const after = new Date().toISOString();

      assert.ok(receipt.timestamp >= before);
      assert.ok(receipt.timestamp <= after);
    });

    it("sanitizes error in receipt", () => {
      const rawError = "API error: api_key=sk_live_secret_key /path/to/file.js:123";
      const cleaned = sanitizeError(rawError);

      const receipt = buildReceipt({
        id: "receipt_error_test",
        candidateId: "cand_error_789",
        candidateDigest: "d".repeat(64),
        platform: "test",
        mode: "live",
        status: "failed",
        idempotencyKey: "error_test_key",
        sanitizedError: cleaned
      });

      assert.match(receipt.sanitizedError, /REDACTED/);
      assert.doesNotMatch(receipt.sanitizedError, /sk_live_secret_key/);
      assert.doesNotMatch(receipt.sanitizedError, /\/path\/to\/file\.js/);
    });

    it("strips secret fields from metadata", () => {
      const receipt = buildReceipt({
        id: "receipt_metadata",
        candidateId: "cand_meta_999",
        candidateDigest: "e".repeat(64),
        platform: "test",
        mode: "draft",
        status: "success",
        idempotencyKey: "metadata_key",
        metadata: {
          duration: 120,
          unsafeTokenField: "UNSAFE_VALUE",
          unsafeSecretField: "UNSAFE_VALUE",
          title: "Safe metadata"
        }
      });

      assert.strictEqual(receipt.metadata.duration, 120);
      assert.strictEqual(receipt.metadata.title, "Safe metadata");
      assert.strictEqual(receipt.metadata.unsafeTokenField, undefined);
      assert.strictEqual(receipt.metadata.unsafeSecretField, undefined);
    });

    it("throws on invalid id format", () => {
      assert.throws(() => buildReceipt({
        id: "invalid id with spaces",
        candidateId: "cand_test",
        candidateDigest: "f".repeat(64),
        platform: "test",
        mode: "draft",
        status: "success",
        idempotencyKey: "test_key_000"
      }), /invalid_id_format/);
    });
  });

  describe("sanitizeError", () => {
    it("removes api_key from error message", () => {
      const sanitized = sanitizeError("Request failed: api_key=sk_live_secret_key");
      assert.match(sanitized, /api_key=REDACTED/);
      assert.doesNotMatch(sanitized, /sk_live_secret_key/);
    });

    it("removes token from error message", () => {
      const sanitized = sanitizeError("Unauthorized: token=bearer_abc123xyz");
      assert.match(sanitized, /token=REDACTED/);
      assert.doesNotMatch(sanitized, /bearer_abc123xyz/);
    });

    it("removes Bearer tokens", () => {
      const sanitized = sanitizeError("Auth failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
      assert.match(sanitized, /Bearer REDACTED/);
      assert.doesNotMatch(sanitized, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
    });

    it("removes file paths", () => {
      const sanitized = sanitizeError("Error in /home/user/project/src/adapter.js:45");
      assert.match(sanitized, /<file>/);
      assert.doesNotMatch(sanitized, /\/home\/user\/project\/src\/adapter\.js/);
    });

    it("removes stack traces (keeps only first line)", () => {
      const error = new Error("Main error message");
      error.stack = "Error: Main error message\n    at /path/to/file.js:10\n    at /other/file.js:20";
      const sanitized = sanitizeError(error);
      assert.match(sanitized, /Main error message/);
      assert.doesNotMatch(sanitized, /at \/path\/to\/file\.js/);
    });

    it("truncates long error messages", () => {
      const longError = "x".repeat(1000);
      const sanitized = sanitizeError(longError);
      assert.ok(sanitized.length <= 500);
    });

    it("handles Error objects", () => {
      const error = new Error("Test error");
      const sanitized = sanitizeError(error);
      assert.strictEqual(sanitized, "Test error");
    });

    it("handles non-Error values", () => {
      const sanitized = sanitizeError("plain string error");
      assert.strictEqual(sanitized, "plain string error");
    });
  });
});
