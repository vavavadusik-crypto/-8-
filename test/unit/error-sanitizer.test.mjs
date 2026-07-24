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

describe("error sanitizer — round 2 hardening", () => {
  it("redacts secrets nested inside objects (recursion)", () => {
    const context = {
      provider: "fal",
      user: { name: "vadim", apiKey: "fal_secret_nested_12345" }
    };
    const sanitized = sanitizeLogContext(context);
    assert.strictEqual(sanitized.provider, "fal");
    assert.strictEqual(sanitized.user.name, "vadim");
    assert.strictEqual(sanitized.user.apiKey, "[REDACTED]");
    assert.ok(!JSON.stringify(sanitized).includes("fal_secret_nested_12345"));
  });

  it("redacts secret-looking strings inside arrays", () => {
    const context = {
      logs: ["all good", "Authorization: Bearer sk-proj-arraysecrettoken1234567890"]
    };
    const sanitized = sanitizeLogContext(context);
    assert.strictEqual(sanitized.logs[0], "all good");
    assert.ok(!JSON.stringify(sanitized).includes("sk-proj-arraysecrettoken1234567890"));
    assert.ok(sanitized.logs[1].includes("[REDACTED_SECRET]"));
  });

  it("caps recursion depth without throwing", () => {
    let deep = { apiKey: "fal_deep_secret_value_123" };
    for (let i = 0; i < 30; i += 1) deep = { nested: deep };
    assert.doesNotThrow(() => sanitizeLogContext(deep));
  });

  it("survives circular references", () => {
    const context = { name: "root", token: "fal_circular_secret_123456" };
    context.self = context;
    let sanitized;
    assert.doesNotThrow(() => { sanitized = sanitizeLogContext(context); });
    assert.strictEqual(sanitized.token, "[REDACTED]");
  });

  it("redacts base64 bearer tokens containing + / = (widened charset)", () => {
    const message = "Authorization failed: Bearer YWJjZGVm+Z2hp/jklmZ29=abcdEFGHij";
    const sanitized = sanitizeError(message);
    assert.ok(!sanitized.includes("YWJjZGVm+Z2hp/jklmZ29=abcdEFGHij"));
    assert.ok(sanitized.includes("[REDACTED_SECRET]"));
  });

  it("redacts base64 token= values containing + / =", () => {
    const message = "token=YWJjZGVm+Z2hp/jklmZ29=abcdEFGHij failed";
    const sanitized = sanitizeError(message);
    assert.ok(!sanitized.includes("YWJjZGVm+Z2hp/jklmZ29=abcdEFGHij"));
    assert.ok(sanitized.includes("[REDACTED_SECRET]"));
  });
});
