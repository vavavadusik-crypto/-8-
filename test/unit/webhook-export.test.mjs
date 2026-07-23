import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createWebhookExportAdapter } from "../../src/publishing/adapters/webhook-export.js";

describe("webhook-export adapter", () => {
  const validCandidate = {
    id: "cand_test_abc123",
    digest: "a".repeat(64),
    projectId: "proj_123",
    platforms: ["webhook_export"],
    recipe: { id: "recipe_1", version: "v1", platform: "webhook_export", width: 1920, height: 1080 },
    artifacts: [
      { name: "test.mp4", type: "video/mp4", bytes: 1000, sha256: "b".repeat(64) }
    ],
    manifestSha256: "c".repeat(64)
  };

  describe("createWebhookExportAdapter", () => {
    it("creates adapter with valid URL", () => {
      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch({ ok: true, status: 200 })
      });

      assert.strictEqual(adapter.platform, "webhook_export");
      assert.strictEqual(adapter.requiresAuth, false);
      assert.strictEqual(adapter.costClass, "free");
      assert.ok(adapter.capabilities.supportsIdempotency);
    });

    it("rejects missing webhookUrl", () => {
      assert.throws(
        () => createWebhookExportAdapter({ fetchFn: mockFetch() }),
        /webhook_url_required/
      );
    });

    it("rejects localhost URLs", () => {
      assert.throws(
        () => createWebhookExportAdapter({ webhookUrl: "http://localhost:3000/webhook", fetchFn: mockFetch() }),
        /webhook_url_localhost_forbidden/
      );
    });

    it("rejects 127.0.0.1 URLs", () => {
      assert.throws(
        () => createWebhookExportAdapter({ webhookUrl: "http://127.0.0.1/webhook", fetchFn: mockFetch() }),
        /webhook_url_localhost_forbidden/
      );
    });

    it("rejects private IP URLs (10.x.x.x)", () => {
      assert.throws(
        () => createWebhookExportAdapter({ webhookUrl: "http://10.0.0.1/webhook", fetchFn: mockFetch() }),
        /webhook_url_private_ip_forbidden/
      );
    });

    it("rejects private IP URLs (192.168.x.x)", () => {
      assert.throws(
        () => createWebhookExportAdapter({ webhookUrl: "http://192.168.1.1/webhook", fetchFn: mockFetch() }),
        /webhook_url_private_ip_forbidden/
      );
    });

    it("rejects private IP URLs (172.16-31.x.x)", () => {
      assert.throws(
        () => createWebhookExportAdapter({ webhookUrl: "http://172.16.0.1/webhook", fetchFn: mockFetch() }),
        /webhook_url_private_ip_forbidden/
      );
    });

    it("rejects AWS metadata endpoint", () => {
      assert.throws(
        () => createWebhookExportAdapter({ webhookUrl: "http://169.254.169.254/latest/meta-data", fetchFn: mockFetch() }),
        /webhook_url_localhost_forbidden/
      );
    });

    it("rejects non-HTTP URLs", () => {
      assert.throws(
        () => createWebhookExportAdapter({ webhookUrl: "ftp://example.com/webhook", fetchFn: mockFetch() }),
        /webhook_url_must_be_http_or_https/
      );
    });

    it("rejects invalid URLs", () => {
      assert.throws(
        () => createWebhookExportAdapter({ webhookUrl: "not a url", fetchFn: mockFetch() }),
        /webhook_url_invalid/
      );
    });
  });

  describe("validate", () => {
    it("accepts valid candidate", () => {
      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch()
      });

      const result = adapter.validate(validCandidate);
      assert.strictEqual(result.ok, true);
      assert.deepStrictEqual(result.problems, []);
    });

    it("rejects candidate without id", () => {
      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch()
      });

      const invalid = { ...validCandidate, id: "" };
      const result = adapter.validate(invalid);
      assert.strictEqual(result.ok, false);
      assert.ok(result.problems.includes("candidate_id_invalid"));
    });

    it("rejects candidate without digest", () => {
      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch()
      });

      const invalid = { ...validCandidate, digest: "invalid" };
      const result = adapter.validate(invalid);
      assert.strictEqual(result.ok, false);
      assert.ok(result.problems.includes("candidate_digest_invalid"));
    });

    it("rejects candidate without platforms", () => {
      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch()
      });

      const invalid = { ...validCandidate, platforms: [] };
      const result = adapter.validate(invalid);
      assert.strictEqual(result.ok, false);
      assert.ok(result.problems.includes("candidate_platforms_missing"));
    });

    it("rejects candidate without artifacts", () => {
      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch()
      });

      const invalid = { ...validCandidate, artifacts: [] };
      const result = adapter.validate(invalid);
      assert.strictEqual(result.ok, false);
      assert.ok(result.problems.includes("candidate_artifacts_missing"));
    });
  });

  describe("publish", () => {
    it("publishes successfully in draft mode", async () => {
      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch({ ok: true, status: 200 })
      });

      const receipt = await adapter.publish(validCandidate, {
        mode: "draft",
        idempotencyKey: "test_key_12345678"
      });

      assert.strictEqual(receipt.schema, "hermest.publish.receipt.v1");
      assert.strictEqual(receipt.candidateId, validCandidate.id);
      assert.strictEqual(receipt.candidateDigest, validCandidate.digest);
      assert.strictEqual(receipt.platform, "webhook_export");
      assert.strictEqual(receipt.mode, "draft");
      assert.strictEqual(receipt.status, "success");
      assert.strictEqual(receipt.idempotencyKey, "test_key_12345678");
    });

    it("publishes successfully in live mode", async () => {
      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch({ ok: true, status: 200 })
      });

      const receipt = await adapter.publish(validCandidate, {
        mode: "live",
        confirm: true,
        idempotencyKey: "live_key_87654321"
      });

      assert.strictEqual(receipt.mode, "live");
      assert.strictEqual(receipt.status, "success");
    });

    it("includes remoteId from response headers", async () => {
      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch({
          ok: true,
          status: 200,
          headers: { "X-Remote-Id": "remote_xyz_789" }
        })
      });

      const receipt = await adapter.publish(validCandidate, {
        mode: "draft",
        idempotencyKey: "header_test_key"
      });

      assert.strictEqual(receipt.remoteId, "remote_xyz_789");
    });

    it("includes url from response headers", async () => {
      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch({
          ok: true,
          status: 200,
          headers: { "X-Remote-Url": "https://example.com/published/123" }
        })
      });

      const receipt = await adapter.publish(validCandidate, {
        mode: "draft",
        idempotencyKey: "url_test_key_1"
      });

      assert.strictEqual(receipt.url, "https://example.com/published/123");
    });

    it("handles AbortSignal cancellation", async () => {
      const controller = new AbortController();

      // Immediately abort before publish starts
      controller.abort();

      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch({ ok: true, status: 200 }),
        sleepFn: () => Promise.resolve()
      });

      const receipt = await adapter.publish(validCandidate, {
        mode: "draft",
        idempotencyKey: "abort_test_key",
        signal: controller.signal
      });

      assert.strictEqual(receipt.status, "failed");
      assert.match(receipt.sanitizedError, /cancelled/i);
    });

    it("retries on 429 rate limit", async () => {
      let callCount = 0;
      const fetchFn = async () => {
        callCount++;
        if (callCount === 1) {
          return mockResponse({ ok: false, status: 429, headers: { "Retry-After": "1" } });
        }
        return mockResponse({ ok: true, status: 200 });
      };

      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn,
        sleepFn: () => Promise.resolve()
      });

      const receipt = await adapter.publish(validCandidate, {
        mode: "draft",
        idempotencyKey: "retry_429_key"
      });

      assert.strictEqual(callCount, 2);
      assert.strictEqual(receipt.status, "success");
    });

    it("retries on 5xx server error", async () => {
      let callCount = 0;
      const fetchFn = async () => {
        callCount++;
        if (callCount === 1) {
          return mockResponse({ ok: false, status: 500 });
        }
        return mockResponse({ ok: true, status: 200 });
      };

      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn,
        sleepFn: () => Promise.resolve()
      });

      const receipt = await adapter.publish(validCandidate, {
        mode: "draft",
        idempotencyKey: "retry_500_key"
      });

      assert.strictEqual(callCount, 2);
      assert.strictEqual(receipt.status, "success");
    });

    it("does NOT retry on 4xx client error", async () => {
      let callCount = 0;
      const fetchFn = async () => {
        callCount++;
        return mockResponse({ ok: false, status: 400, text: "Bad Request" });
      };

      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn,
        sleepFn: () => Promise.resolve()
      });

      const receipt = await adapter.publish(validCandidate, {
        mode: "draft",
        idempotencyKey: "no_retry_400_key"
      });

      assert.strictEqual(callCount, 1);
      assert.strictEqual(receipt.status, "failed");
      assert.match(receipt.sanitizedError, /400/);
    });

    it("fails after max retries exhausted", async () => {
      let callCount = 0;
      const fetchFn = async () => {
        callCount++;
        return mockResponse({ ok: false, status: 500 });
      };

      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn,
        sleepFn: () => Promise.resolve()
      });

      const receipt = await adapter.publish(validCandidate, {
        mode: "draft",
        idempotencyKey: "max_retry_key_1"
      });

      assert.strictEqual(callCount, 4); // Initial + 3 retries
      assert.strictEqual(receipt.status, "failed");
    });

    it("sanitizes errors in receipt", async () => {
      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn: mockFetch({ error: new Error("Authorization failed: Bearer sk_live_super_secret_key_12345") }),
        sleepFn: () => Promise.resolve()
      });

      const receipt = await adapter.publish(validCandidate, {
        mode: "draft",
        idempotencyKey: "sanitize_error"
      });

      assert.strictEqual(receipt.status, "failed");
      assert.match(receipt.sanitizedError, /REDACTED/);
      assert.doesNotMatch(receipt.sanitizedError, /sk_live_super_secret_key_12345/);
    });

    it("sends correct headers", async () => {
      let capturedHeaders = null;
      const fetchFn = async (_url, options) => {
        capturedHeaders = options.headers;
        return mockResponse({ ok: true, status: 200 });
      };

      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        headers: { "X-Custom-Header": "custom-value" },
        fetchFn
      });

      await adapter.publish(validCandidate, {
        mode: "draft",
        idempotencyKey: "headers_test_key"
      });

      assert.strictEqual(capturedHeaders["Content-Type"], "application/json");
      assert.strictEqual(capturedHeaders["X-Hermest-Idempotency-Key"], "headers_test_key");
      assert.strictEqual(capturedHeaders["X-Hermest-Mode"], "draft");
      assert.strictEqual(capturedHeaders["X-Hermest-Candidate-Id"], validCandidate.id);
      assert.strictEqual(capturedHeaders["X-Hermest-Candidate-Digest"], validCandidate.digest);
      assert.strictEqual(capturedHeaders["X-Custom-Header"], "custom-value");
    });

    it("sends correct payload", async () => {
      let capturedBody = null;
      const fetchFn = async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse({ ok: true, status: 200 });
      };

      const adapter = createWebhookExportAdapter({
        webhookUrl: "https://example.com/webhook",
        fetchFn
      });

      await adapter.publish(validCandidate, {
        mode: "live",
        confirm: true,
        idempotencyKey: "payload_test_key"
      });

      assert.strictEqual(capturedBody.schema, "hermest.webhook.payload.v1");
      assert.strictEqual(capturedBody.mode, "live");
      assert.strictEqual(capturedBody.candidate.id, validCandidate.id);
      assert.strictEqual(capturedBody.candidate.digest, validCandidate.digest);
      assert.strictEqual(capturedBody.candidate.projectId, validCandidate.projectId);
      assert.ok(capturedBody.timestamp);
    });
  });
});

// Mock fetch helpers

function mockFetch(config = {}) {
  return async () => {
    if (config.delayMs) {
      await new Promise(resolve => setTimeout(resolve, config.delayMs));
    }

    if (config.error) {
      throw config.error;
    }

    return mockResponse(config);
  };
}

function mockResponse(config = {}) {
  const headers = new Map();
  if (config.headers) {
    for (const [key, value] of Object.entries(config.headers)) {
      headers.set(key, value);
    }
  }

  return {
    ok: config.ok !== undefined ? config.ok : true,
    status: config.status || 200,
    headers: {
      get(key) {
        return headers.get(key) || null;
      }
    },
    async text() {
      return config.text || "";
    }
  };
}
