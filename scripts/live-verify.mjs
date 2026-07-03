const base = (process.env.HERMEST_LIVE_URL || "https://hermest-board.vercel.app").replace(/\/$/, "");

const failures = [];

await checkHealth();
await checkStorageStatus();
await checkPreflight();
await checkSessionCurrent();
await checkAgentPlan();
await checkWriteGuard();
await checkSourceZip();
await checkSecurityHeaders();

if (failures.length) {
  for (const failure of failures) console.error(`live:fail ${failure}`);
  process.exit(1);
}

console.log(`live: ok ${base}`);

async function checkHealth() {
  const { response, json } = await getJson("/api/health");
  assert(response.status === 200, `health status ${response.status}`);
  assert(json.ok === true, "health ok flag");
  assert(json.version === "0.2.0", `health version ${json.version}`);
}

async function checkStorageStatus() {
  const { response, json } = await getJson(`/api/product?route=${encodeURIComponent("storage/status")}`);
  assert(response.status === 200, `storage status ${response.status}`);
  assert(json.adapter === "json-file", `storage adapter ${json.adapter}`);
  assert(json.adapterInterfaceVersion === 1, `storage adapter interface ${json.adapterInterfaceVersion}`);
  assert(json.writeEnabled === false, "production storage writes must stay disabled");
  assert(json.auth?.writeAccess === "blocked_by_storage_guard", `storage auth guard ${json.auth?.writeAccess}`);
}

async function checkPreflight() {
  const { response, json } = await getJson(`/api/product?route=${encodeURIComponent("preflight")}`);
  assert(response.status === 200, `preflight status ${response.status}`);
  assert(json.launchReady === false, "preflight launchReady must stay false");
  assert(json.canWriteProductionProjects === false, "preflight production writes must stay false");
  assert(json.canAutopublish === false, "preflight autopublish must stay false");
  assert(json.storage?.adapterInterfaceImplemented === true, "preflight storage adapter interface");
  assert(json.storage?.durableAdapterImplemented === false, "preflight durable adapter disabled");
  assert(json.blockers?.includes("real_user_auth_not_implemented"), "preflight real auth blocker");
}

async function checkSessionCurrent() {
  const { response, json } = await getJson(`/api/product?route=${encodeURIComponent("session/current")}`);
  assert(response.status === 200, `session current status ${response.status}`);
  assert(json.session?.signedSessionVerifierImplemented === true, "session verifier implemented");
  assert(json.session?.realUserAuthImplemented === false, "session real user auth disabled");
  assert(json.actor?.id === "anonymous", `session anonymous actor ${json.actor?.id}`);
}

async function checkAgentPlan() {
  const response = await fetch(`${base}/api/product?route=${encodeURIComponent("agent/plan")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      platforms: ["youtube_video"],
      tools: ["parser"],
      languages: ["ru"]
    })
  });
  const json = await response.json();
  assert(response.status === 200, `agent plan status ${response.status}`);
  assert(json.status === "blocked_until_connectors_and_storage", `agent plan ${json.status}`);
}

async function checkWriteGuard() {
  const response = await fetch(`${base}/api/product?route=${encodeURIComponent("projects")}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: { title: "live verify guard" } })
  });
  const json = await response.json();
  assert(response.status === 501, `write guard status ${response.status}`);
  assert(json.error === "server_storage_not_configured", `write guard error ${json.error}`);
}

async function checkSourceZip() {
  const response = await fetch(`${base}/download/hermest-board-alpha-source.zip`, { method: "HEAD" });
  const size = Number(response.headers.get("content-length") || 0);
  assert(response.status === 200, `zip status ${response.status}`);
  assert(size > 60000, `zip size ${size}`);
}

async function checkSecurityHeaders() {
  const response = await fetch(`${base}/`);
  const csp = response.headers.get("content-security-policy") || "";
  const permissions = response.headers.get("permissions-policy") || "";
  const referrer = response.headers.get("referrer-policy") || "";
  const contentType = response.headers.get("x-content-type-options") || "";

  assert(response.status === 200, `root status ${response.status}`);
  assert(csp.includes("object-src 'none'"), "CSP object-src none");
  assert(csp.includes("frame-ancestors 'none'"), "CSP frame-ancestors none");
  assert(permissions.includes("display-capture=(self)"), "Permissions-Policy display-capture");
  assert(referrer === "strict-origin-when-cross-origin", `Referrer-Policy ${referrer}`);
  assert(contentType === "nosniff", `X-Content-Type-Options ${contentType}`);
}

async function getJson(path) {
  const response = await fetch(`${base}${path}`);
  const json = await response.json();
  return { response, json };
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
