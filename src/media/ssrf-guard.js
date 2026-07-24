import { URL } from "node:url";

const ALLOWED_SCHEMES = new Set(["https"]);
const LOCALHOST_SCHEMES = new Set(["http"]);

// Private/link-local IP ranges (IPv4)
const PRIVATE_IP_PATTERNS = [
  /^127\./,           // loopback
  /^10\./,            // private class A
  /^172\.(1[6-9]|2[0-9]|3[01])\./,  // private class B
  /^192\.168\./,      // private class C
  /^169\.254\./,      // link-local
  /^0\./,             // reserved
  /^224\./,           // multicast
  /^255\.255\.255\.255$/  // broadcast
];

export function validateOutboundUrl(urlString, { allowLocalhost = false } = {}) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new TypeError("Invalid URL format");
  }

  // Scheme validation
  if (allowLocalhost && LOCALHOST_SCHEMES.has(parsed.protocol.slice(0, -1))) {
    // Allow http://localhost or http://127.0.0.1 only when explicitly allowed
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return parsed;
    }
    throw new Error("SSRF blocked: http scheme only allowed for localhost");
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol.slice(0, -1))) {
    throw new Error(`SSRF blocked: only HTTPS allowed (got ${parsed.protocol})`);
  }

  // Hostname validation
  const hostname = parsed.hostname.toLowerCase();

  // Block localhost references
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    throw new Error("SSRF blocked: localhost access denied");
  }

  // Block cloud metadata endpoints (check before private IP patterns to get specific error)
  const METADATA_HOSTS = [
    "169.254.169.254",  // AWS/Azure/GCP metadata
    "metadata.google.internal",
    "169.254.169.253"   // Alibaba Cloud
  ];
  if (METADATA_HOSTS.includes(hostname)) {
    throw new Error("SSRF blocked: cloud metadata endpoint access denied");
  }

  // Block private IP ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error("SSRF blocked: private IP range access denied");
    }
  }

  // Block file:// and other dangerous schemes
  if (["file", "ftp", "gopher", "dict", "jar"].includes(parsed.protocol.slice(0, -1))) {
    throw new Error(`SSRF blocked: ${parsed.protocol} scheme not allowed`);
  }

  return parsed;
}

export function isAllowedProviderUrl(urlString, allowedHosts) {
  const parsed = validateOutboundUrl(urlString);

  // Check against provider allowlist
  if (allowedHosts && !allowedHosts.includes(parsed.hostname)) {
    throw new Error(`SSRF blocked: host ${parsed.hostname} not in allowlist`);
  }

  return parsed;
}
