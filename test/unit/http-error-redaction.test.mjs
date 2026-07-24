import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleApiError } from "../../api/_lib/http.js";

describe("http error handler — secret redaction", () => {
  it("redacts API keys from error messages", () => {
    const mockResponse = createMockResponse();
    const error = new Error("Invalid key: sk-proj-abc123xyz789");
    error.status = 400;

    handleApiError(mockResponse, error);

    const payload = mockResponse.lastPayload;
    assert.ok(!payload.error.includes("sk-proj-abc123xyz789"));
    assert.ok(payload.error.includes("[REDACTED_KEY]"));
    assert.strictEqual(mockResponse.lastStatus, 400);
  });

  it("redacts Bearer tokens from error messages", () => {
    const mockResponse = createMockResponse();
    const error = {
      status: 401,
      message: "Authorization failed: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    };

    handleApiError(mockResponse, error);

    const payload = mockResponse.lastPayload;
    assert.ok(!payload.error.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    assert.ok(payload.error.includes("[REDACTED]"));
  });

  it("redacts secrets from note field", () => {
    const mockResponse = createMockResponse();
    const error = {
      status: 500,
      code: "provider_error",
      note: "Failed with api_key=fal_secret_12345"
    };

    handleApiError(mockResponse, error);

    const payload = mockResponse.lastPayload;
    assert.ok(!payload.note.includes("fal_secret_12345"));
    assert.ok(payload.note.includes("[REDACTED]"));
  });

  it("redacts base64 Bearer tokens containing + / = (widened charset)", () => {
    const mockResponse = createMockResponse();
    const error = {
      status: 401,
      message: "Authorization failed: Bearer YWJjZGVm+Z2hp/jklmZ29=abcdEFGHij"
    };

    handleApiError(mockResponse, error);

    const payload = mockResponse.lastPayload;
    assert.ok(!payload.error.includes("YWJjZGVm+Z2hp/jklmZ29=abcdEFGHij"));
    assert.ok(payload.error.includes("Bearer [REDACTED]"));
  });

  it("preserves non-secret error details", () => {
    const mockResponse = createMockResponse();
    const error = {
      status: 404,
      code: "not_found",
      note: "File not found: /tmp/video.mp4"
    };

    handleApiError(mockResponse, error);

    const payload = mockResponse.lastPayload;
    assert.strictEqual(payload.error, "not_found");
    assert.strictEqual(payload.note, "File not found: /tmp/video.mp4");
    assert.strictEqual(mockResponse.lastStatus, 404);
  });

  it("handles missing error gracefully", () => {
    const mockResponse = createMockResponse();
    handleApiError(mockResponse, null);

    const payload = mockResponse.lastPayload;
    assert.strictEqual(payload.error, "internal_error");
    assert.strictEqual(mockResponse.lastStatus, 500);
  });
});

function createMockResponse() {
  return {
    lastStatus: null,
    lastPayload: null,
    status(code) {
      this.lastStatus = code;
      return this;
    },
    json(payload) {
      this.lastPayload = payload;
      return this;
    }
  };
}
