import { URL } from "node:url";
import { lookup as dnsLookup } from "node:dns/promises";

const ALLOWED_SCHEMES = new Set(["https"]);
const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// Private/link-local IP ranges (IPv4)
const PRIVATE_IP_PATTERNS = [
  /^127\./,                         // loopback
  /^10\./,                          // private class A
  /^172\.(1[6-9]|2[0-9]|3[01])\./,  // private class B
  /^192\.168\./,                    // private class C
  /^169\.254\./,                    // link-local
  /^0\./,                           // reserved / "this host"
  /^224\./,                         // multicast
  /^255\.255\.255\.255$/            // broadcast
];

const METADATA_HOSTS = [
  "169.254.169.254",         // AWS/Azure/GCP metadata
  "metadata.google.internal",
  "169.254.169.253"          // Alibaba Cloud
];

const defaultFetch = (...args) => globalThis.fetch(...args);

export function validateOutboundUrl(urlString, { allowLocalhost = false } = {}) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new TypeError("Invalid URL format");
  }

  const scheme = parsed.protocol.slice(0, -1);
  // Node's WHATWG URL keeps IPv6 hosts bracketed ("[::1]"); strip for checks.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // http is only ever allowed for explicit local runtimes (e.g. Ollama).
  if (allowLocalhost && scheme === "http") {
    if (LOCALHOST_HOSTS.has(host)) return parsed;
    throw new Error("SSRF blocked: http scheme only allowed for localhost");
  }

  if (!ALLOWED_SCHEMES.has(scheme)) {
    throw new Error(`SSRF blocked: only HTTPS allowed (got ${parsed.protocol})`);
  }

  if (LOCALHOST_HOSTS.has(host)) {
    throw new Error("SSRF blocked: localhost access denied");
  }

  // Metadata hosts get a specific message (checked before generic ranges).
  if (METADATA_HOSTS.includes(host)) {
    throw new Error("SSRF blocked: cloud metadata endpoint access denied");
  }

  const reason = privateAddressReason(host);
  if (reason) throw new Error(`SSRF blocked: ${reason}`);

  return parsed;
}

export function isAllowedProviderUrl(urlString, allowedHosts) {
  const parsed = validateOutboundUrl(urlString);

  if (allowedHosts && !allowedHosts.includes(parsed.hostname)) {
    throw new Error(`SSRF blocked: host ${parsed.hostname} not in allowlist`);
  }

  return parsed;
}

// Resolve the host and re-apply the IP checks to every resolved address so a
// hostname that points at a private/loopback/link-local target is rejected.
// Best-effort and fail-CLOSED: a resolver hiccup rejects rather than opening.
export async function assertPublicDns(hostname, { lookup = dnsLookup } = {}) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new Error("SSRF blocked: empty host for DNS resolution");

  let addresses;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error(`SSRF blocked: DNS resolution failed for ${host}`);
  }

  const list = Array.isArray(addresses) ? addresses : [addresses];
  if (list.length === 0) {
    throw new Error(`SSRF blocked: DNS resolution returned no addresses for ${host}`);
  }

  for (const entry of list) {
    const address = typeof entry === "string" ? entry : entry?.address;
    const reason = privateAddressReason(String(address || "").toLowerCase());
    if (reason) {
      throw new Error(`SSRF blocked: ${host} resolves to a blocked address ${address} (${reason})`);
    }
  }
}

// Guarded fetch: validate the URL (+ DNS), force redirect:"manual", and
// re-validate every redirect target so a 3xx to an internal host is blocked
// instead of silently followed.
export async function safeFetch(urlString, init = {}, options = {}) {
  const {
    fetchImpl = defaultFetch,
    lookup = dnsLookup,
    allowLocalhost = false,
    maxRedirects = 5
  } = options;

  let currentUrl = urlString;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const parsed = validateOutboundUrl(currentUrl, { allowLocalhost });
    await assertPublicDns(parsed.hostname, { lookup });

    const response = await fetchImpl(currentUrl, { ...init, redirect: "manual" });
    const status = Number(response?.status);

    if (status >= 300 && status < 400) {
      const location = response.headers?.get?.("location");
      if (!location) return response;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }

  throw new Error("SSRF blocked: too many redirects");
}

function privateAddressReason(address) {
  if (!address) return null;
  return address.includes(":")
    ? privateIpv6Reason(address)
    : privateIpv4Reason(address);
}

function privateIpv4Reason(address) {
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(address)) return "private IP range access denied";
  }
  return null;
}

function privateIpv6Reason(address) {
  // IPv4-mapped (::ffff:0:0/96) — extract the embedded v4 and re-check it.
  const mapped = extractIpv4Mapped(address);
  if (mapped) return privateIpv4Reason(mapped);

  const groups = expandIpv6(address);
  if (!groups) return null;

  if (groups.every(part => part === 0)) return "localhost access denied"; // ::
  if (groups.slice(0, 7).every(part => part === 0) && groups[7] === 1) {
    return "localhost access denied"; // ::1 loopback
  }

  const first = groups[0];
  if ((first & 0xffc0) === 0xfe80) return "private IP range access denied"; // fe80::/10
  if ((first & 0xfe00) === 0xfc00) return "private IP range access denied"; // fc00::/7

  return null;
}

function extractIpv4Mapped(address) {
  const dotted = address.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return dotted[1];

  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join(".");
  }

  return null;
}

// Expand an IPv6 string (incl. "::" compression and dotted-quad tail) to 8
// numeric groups, or null if it does not parse.
function expandIpv6(input) {
  let addr = input;

  const tail = addr.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const octets = tail[1].split(".").map(Number);
    if (octets.some(octet => octet > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    addr = addr.slice(0, tail.index) + hi + ":" + lo;
  }

  const halves = addr.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const rear = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;

  let parts;
  if (rear === null) {
    if (head.length !== 8) return null;
    parts = head;
  } else {
    const missing = 8 - head.length - rear.length;
    if (missing < 0) return null;
    parts = [...head, ...Array(missing).fill("0"), ...rear];
  }

  const nums = parts.map(part => (/^[0-9a-f]{1,4}$/i.test(part) ? parseInt(part, 16) : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}
