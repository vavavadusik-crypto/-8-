import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateOutboundUrl,
  isAllowedProviderUrl,
  assertPublicDns,
  safeFetch
} from "../../src/media/ssrf-guard.js";

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

describe("SSRF guard — IPv6 private ranges", () => {
  it("blocks IPv6 loopback ::1", () => {
    assert.throws(
      () => validateOutboundUrl("https://[::1]/"),
      { message: /SSRF blocked/ }
    );
  });

  it("blocks IPv6 link-local fe80::/10", () => {
    assert.throws(
      () => validateOutboundUrl("https://[fe80::1]/"),
      { message: /private IP range access denied/ }
    );
  });

  it("blocks IPv6 unique-local fc00::/7", () => {
    assert.throws(
      () => validateOutboundUrl("https://[fc00::1]/"),
      { message: /private IP range access denied/ }
    );
    assert.throws(
      () => validateOutboundUrl("https://[fd12:3456:789a::1]/"),
      { message: /private IP range access denied/ }
    );
  });

  it("blocks IPv4-mapped ::ffff:0:0/96 (::ffff:127.0.0.1)", () => {
    // WHATWG URL normalizes this to [::ffff:7f00:1]
    assert.throws(
      () => validateOutboundUrl("https://[::ffff:127.0.0.1]/"),
      { message: /private IP range access denied/ }
    );
  });

  it("blocks IPv4-mapped to metadata (::ffff:169.254.169.254)", () => {
    assert.throws(
      () => validateOutboundUrl("https://[::ffff:169.254.169.254]/"),
      { message: /SSRF blocked/ }
    );
  });

  it("does not over-block public IPv6 addresses", () => {
    const url = validateOutboundUrl("https://[2606:4700:4700::1111]/");
    assert.strictEqual(url.hostname, "[2606:4700:4700::1111]");
  });
});

describe("SSRF guard — DNS resolution re-check", () => {
  it("rejects a hostname that resolves to a private IPv4", async () => {
    const lookup = async () => [{ address: "127.0.0.1", family: 4 }];
    await assert.rejects(
      assertPublicDns("evil.example.com", { lookup }),
      { message: /SSRF blocked/ }
    );
  });

  it("rejects a hostname that resolves to a private IPv6", async () => {
    const lookup = async () => [{ address: "fe80::1", family: 6 }];
    await assert.rejects(
      assertPublicDns("evil6.example.com", { lookup }),
      { message: /SSRF blocked/ }
    );
  });

  it("rejects when one of several resolved addresses is private", async () => {
    const lookup = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 }
    ];
    await assert.rejects(
      assertPublicDns("mixed.example.com", { lookup }),
      { message: /SSRF blocked/ }
    );
  });

  it("allows a hostname that resolves only to public IPs", async () => {
    const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
    await assert.doesNotReject(assertPublicDns("api.example.com", { lookup }));
  });

  it("fails CLOSED when the resolver errors", async () => {
    const lookup = async () => { throw new Error("ENOTFOUND"); };
    await assert.rejects(
      assertPublicDns("broken.example.com", { lookup }),
      { message: /SSRF blocked/ }
    );
  });
});

describe("SSRF guard — redirect safety", () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

  it("passes redirect:manual to the underlying fetch", async () => {
    let seenInit;
    const fetchImpl = async (_url, init) => {
      seenInit = init;
      return { status: 200, headers: { get: () => null } };
    };
    const res = await safeFetch("https://api.example.com/x", {}, {
      fetchImpl,
      lookup: publicLookup
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(seenInit.redirect, "manual");
  });

  it("blocks a 302 redirect to an internal metadata endpoint", async () => {
    const fetchImpl = async () => ({
      status: 302,
      headers: {
        get: (name) =>
          name.toLowerCase() === "location" ? "http://169.254.169.254/" : null
      }
    });
    await assert.rejects(
      safeFetch("https://api.example.com/x", {}, { fetchImpl, lookup: publicLookup }),
      { message: /SSRF blocked|only HTTPS allowed/ }
    );
  });

  it("blocks a redirect to a private IP literal", async () => {
    const fetchImpl = async () => ({
      status: 301,
      headers: {
        get: (name) =>
          name.toLowerCase() === "location" ? "https://10.0.0.1/internal" : null
      }
    });
    await assert.rejects(
      safeFetch("https://api.example.com/x", {}, { fetchImpl, lookup: publicLookup }),
      { message: /private IP range access denied/ }
    );
  });

  it("caps the number of redirects followed", async () => {
    const fetchImpl = async () => ({
      status: 302,
      headers: {
        get: (name) =>
          name.toLowerCase() === "location" ? "https://api.example.com/loop" : null
      }
    });
    await assert.rejects(
      safeFetch("https://api.example.com/x", {}, {
        fetchImpl,
        lookup: publicLookup,
        maxRedirects: 3
      }),
      { message: /too many redirects/ }
    );
  });
});
