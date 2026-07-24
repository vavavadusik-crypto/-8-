import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeError, sanitizeLogContext } from "../../src/media/error-sanitizer.js";

describe("error sanitizer — secret redaction", () => {
  it("redacts sk- OpenAI keys", () => {
    const error = new Error("API error: Invalid key sk-proj-abc123xyz789");
    const sanitized = sanitizeError(error);
    assert.ok(!sanitized.includes("sk-proj-abc123xyz789"));
    assert.ok(sanitized.includes("[REDACTED_SECRET]"));
  });

  it("redacts Bearer tokens", () => {
    const message = "Authorization failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const sanitized = sanitizeError(message);
    assert.ok(!sanitized.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    assert.ok(sanitized.includes("[REDACTED_SECRET]"));
  });

  it("redacts api_key= patterns", () => {
    const message = 'Failed to authenticate: api_key="fal_abc123xyz789"';
    const sanitized = sanitizeError(message);
    assert.ok(!sanitized.includes("fal_abc123xyz789"));
    assert.ok(sanitized.includes("[REDACTED]")); // env pattern catches api_key=
  });

  it("redacts environment variable secrets", () => {
    const message = "HERMEST_FAL_API_KEY=fal_secret_12345";
    const sanitized = sanitizeError(message);
    assert.ok(!sanitized.includes("fal_secret_12345"));
    assert.ok(sanitized.includes("HERMEST_FAL_API_KEY=[REDACTED]"));
  });

  it("preserves non-secret error messages", () => {
    const error = new Error("File not found: /tmp/video.mp4");
    const sanitized = sanitizeError(error);
    assert.strictEqual(sanitized, "File not found: /tmp/video.mp4");
  });

  it("sanitizes log context objects", () => {
    const context = {
      provider: "fal",
      apiKey: "fal_secret_key_12345",
      status: "failed"
    };
    const sanitized = sanitizeLogContext(context);
    assert.strictEqual(sanitized.provider, "fal");
    assert.strictEqual(sanitized.apiKey, "[REDACTED]");
    assert.strictEqual(sanitized.status, "failed");
  });

  it("redacts secret-looking string values in context", () => {
    const context = {
      url: "https://api.example.com",
      authorization: "Bearer sk-proj-dangerous123456789"
    };
    const sanitized = sanitizeLogContext(context);
    assert.ok(!sanitized.authorization.includes("sk-proj-dangerous123456789"));
    assert.ok(sanitized.authorization.includes("[REDACTED"));
  });

  it("handles null and undefined gracefully", () => {
    assert.strictEqual(sanitizeError(null), "unknown_error");
    assert.strictEqual(sanitizeError(undefined), "unknown_error");
    assert.strictEqual(sanitizeLogContext(null), null);
  });
});
