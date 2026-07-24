import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateOutboundUrl, isAllowedProviderUrl } from "../../src/media/ssrf-guard.js";

describe("SSRF guard — outbound URL validation", () => {
  it("allows valid HTTPS URLs", () => {
    const url = validateOutboundUrl("https://api.openai.com/v1/chat");
    assert.strictEqual(url.hostname, "api.openai.com");
    assert.strictEqual(url.protocol, "https:");
  });

  it("blocks http:// (non-localhost)", () => {
    assert.throws(
      () => validateOutboundUrl("http://example.com/api"),
      { message: /only HTTPS allowed/ }
    );
  });

  it("blocks file:// URLs", () => {
    assert.throws(
      () => validateOutboundUrl("file:///etc/passwd"),
      { message: /only HTTPS allowed/ }
    );
  });

  it("blocks localhost (127.0.0.1)", () => {
    assert.throws(
      () => validateOutboundUrl("https://127.0.0.1:8080/admin"),
      { message: /localhost access denied/ }
    );
  });

  it("blocks localhost hostname", () => {
    assert.throws(
      () => validateOutboundUrl("https://localhost:3000/secret"),
      { message: /localhost access denied/ }
    );
  });

  it("blocks private IP 10.x.x.x", () => {
    assert.throws(
      () => validateOutboundUrl("https://10.0.0.1/internal"),
      { message: /private IP range access denied/ }
    );
  });

  it("blocks private IP 192.168.x.x", () => {
    assert.throws(
      () => validateOutboundUrl("https://192.168.1.1/router"),
      { message: /private IP range access denied/ }
    );
  });

  it("blocks private IP 172.16-31.x.x", () => {
    assert.throws(
      () => validateOutboundUrl("https://172.20.10.5/admin"),
      { message: /private IP range access denied/ }
    );
  });

  it("blocks link-local 169.254.x.x", () => {
    assert.throws(
      () => validateOutboundUrl("https://169.254.1.1/"),
      { message: /private IP range access denied/ }
    );
  });

  it("blocks AWS metadata endpoint", () => {
    assert.throws(
      () => validateOutboundUrl("https://169.254.169.254/latest/meta-data"),
      { message: /cloud metadata endpoint access denied/ }
    );
  });

  it("blocks GCP metadata endpoint", () => {
    assert.throws(
      () => validateOutboundUrl("https://metadata.google.internal/computeMetadata/v1/"),
      { message: /cloud metadata endpoint access denied/ }
    );
  });

  it("allows http://localhost when explicitly allowed", () => {
    const url = validateOutboundUrl("http://localhost:11434/v1", { allowLocalhost: true });
    assert.strictEqual(url.hostname, "localhost");
    assert.strictEqual(url.protocol, "http:");
  });

  it("allows http://127.0.0.1 when explicitly allowed", () => {
    const url = validateOutboundUrl("http://127.0.0.1:8080/api", { allowLocalhost: true });
    assert.strictEqual(url.hostname, "127.0.0.1");
  });

  it("blocks invalid URLs", () => {
    assert.throws(
      () => validateOutboundUrl("not-a-url"),
      { message: /Invalid URL format/ }
    );
  });

  it("enforces provider allowlist", () => {
    const allowedHosts = ["api.openai.com", "api.groq.com"];

    // Allowed host
    const url1 = isAllowedProviderUrl("https://api.openai.com/v1/chat", allowedHosts);
    assert.strictEqual(url1.hostname, "api.openai.com");

    // Blocked host (not in allowlist)
    assert.throws(
      () => isAllowedProviderUrl("https://evil.com/steal", allowedHosts),
      { message: /host evil.com not in allowlist/ }
    );
  });
});
