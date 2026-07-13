import { readProviderCatalog } from "./provider-catalog.js";

const CAPABILITY_SCHEMA = "hermest.connector-capabilities.v1";
const RUNTIMES = new Set(["server", "local_media"]);

const CAPABILITY_DEFINITIONS = Object.freeze([
  capability("text.generate", false, [
    adapter("openai-text-v1", ["openai"], true, ["server", "local_media"], "request_byok"),
    adapter("groq-text-v1", ["groq"], true, ["server", "local_media"], "request_byok"),
    adapter("mistral-text-v1", ["mistral"], true, ["server", "local_media"], "request_byok"),
    adapter("openrouter-text-v1", ["openrouter"], true, ["server", "local_media"], "request_byok"),
    adapter("deepseek-text-v1", ["deepseek"], true, ["server", "local_media"], "request_byok"),
    adapter("together-text-v1", ["together"], true, ["server", "local_media"], "request_byok")
  ]),
  capability("research.search", false, [
    adapter("public-research-v1", ["wikipedia", "wikidata", "crossref", "arxiv", "openlibrary", "github-public"], true, ["server", "local_media"], "none")
  ]),
  capability("media.search", false, [
    adapter("commons-search-v1", ["commons"], true, ["server", "local_media"], "none"),
    adapter("pexels-search-v1", ["pexels"], false, ["server", "local_media"], "server_env"),
    adapter("pixabay-search-v1", ["pixabay"], false, ["server", "local_media"], "server_env"),
    adapter("unsplash-search-v1", ["unsplash"], false, ["server", "local_media"], "server_env")
  ]),
  capability("image.generate", false, [
    adapter("fal-image-v1", ["fal"], false, ["server", "local_media"], "server_env"),
    adapter("replicate-image-v1", ["replicate"], false, ["server", "local_media"], "server_env"),
    adapter("stability-image-v1", ["stability"], false, ["server", "local_media"], "server_env"),
    adapter("openai-image-v1", ["openai"], false, ["server", "local_media"], "request_byok")
  ]),
  capability("speech.synthesize", false, [
    adapter("local-flite-v1", [], true, ["local_media"], "none"),
    adapter("elevenlabs-tts-v1", ["elevenlabs"], false, ["server", "local_media"], "server_env"),
    adapter("openai-tts-v1", ["openai"], false, ["server", "local_media"], "request_byok")
  ]),
  capability("speech.transcribe", false, [
    adapter("deepgram-stt-v1", ["deepgram"], false, ["server", "local_media"], "server_env"),
    adapter("assemblyai-stt-v1", ["assemblyai"], false, ["server", "local_media"], "server_env"),
    adapter("openai-stt-v1", ["openai"], false, ["server", "local_media"], "request_byok")
  ]),
  capability("video.generate", false, [
    adapter("fal-video-v1", ["fal"], false, ["server", "local_media"], "server_env"),
    adapter("replicate-video-v1", ["replicate"], false, ["server", "local_media"], "server_env")
  ]),
  capability("storage.put", false, [
    adapter("vercel-blob-v1", ["vercel-blob"], false, ["server"], "server_env"),
    adapter("cloudflare-r2-v1", ["cloudflare-r2"], false, ["server"], "server_env"),
    adapter("supabase-object-v1", ["supabase"], false, ["server"], "server_env")
  ]),
  capability("publish.draft", true, [
    adapter("youtube-publish-v1", ["youtube"], false, ["server"], "oauth", ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]),
    adapter("tiktok-publish-v1", ["tiktok"], false, ["server"], "oauth", ["TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET"]),
    adapter("instagram-publish-v1", ["instagram"], false, ["server"], "oauth", ["META_APP_ID", "META_APP_SECRET"])
  ]),
  capability("analytics.read", false, [
    adapter("youtube-analytics-v1", ["youtube"], false, ["server"], "oauth", ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]),
    adapter("tiktok-analytics-v1", ["tiktok"], false, ["server"], "oauth", ["TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET"]),
    adapter("instagram-insights-v1", ["instagram"], false, ["server"], "oauth", ["META_APP_ID", "META_APP_SECRET"])
  ])
]);

export function getConnectorCapabilityStatus(options = {}) {
  const context = normalizeContext(options);
  return {
    ok: true,
    schema: CAPABILITY_SCHEMA,
    runtime: context.runtime,
    canAutopublish: false,
    capabilities: CAPABILITY_DEFINITIONS.map(definition => planDefinition(definition, context)),
    note: "Configured credentials never imply an implemented adapter. Publishing remains approval-gated and non-executable."
  };
}

export function planConnectorCapability(capabilityId, options = {}) {
  const definition = CAPABILITY_DEFINITIONS.find(item => item.id === capabilityId);
  if (!definition) {
    throw new TypeError(`unknown_connector_capability:${String(capabilityId || "")}`);
  }
  return planDefinition(definition, normalizeContext(options));
}

function planDefinition(definition, context) {
  const evaluated = definition.adapters.map(item => evaluateAdapter(item, context));
  const primary = evaluated.find(item => item.executable)
    || evaluated.find(item => item.state === "configured_but_adapter_missing")
    || evaluated.find(item => item.state === "oauth_skeleton")
    || evaluated.find(item => item.runtimeAvailable)
    || evaluated[0];
  const blockers = unique(evaluated.flatMap(item => item.blockers));

  if (definition.approvalRequired) {
    blockers.push("immutable_publish_candidate_required", "explicit_human_approval_required", "autopublishing_disabled");
  }

  return {
    id: definition.id,
    state: definition.approvalRequired ? "approval_required" : capabilityState(evaluated),
    executable: !definition.approvalRequired && Boolean(primary?.executable),
    approvalRequired: definition.approvalRequired,
    primary: routeSummary(primary),
    fallbacks: evaluated.filter(item => item !== primary).map(routeSummary),
    providers: mergeProviders(evaluated),
    blockers: unique(blockers)
  };
}

function evaluateAdapter(definition, context) {
  const providers = definition.providerIds.map(providerId => {
    const provider = context.providerById.get(providerId);
    if (!provider) {
      return {
        id: providerId,
        name: providerId,
        auth: "unknown",
        catalogStatus: "missing",
        configured: false,
        state: "blocked"
      };
    }
    const configured = providerConfigured(provider, definition, context);
    return {
      id: provider.id,
      name: provider.name,
      auth: provider.auth,
      catalogStatus: provider.status,
      configured,
      state: provider.auth === "oauth"
        ? "oauth_skeleton"
        : adapterState(definition, context.runtime, configured)
    };
  });
  const runtimeAvailable = definition.runtimes.includes(context.runtime);
  const configured = definition.configuration === "none"
    || providers.some(provider => provider.configured);
  const executable = definition.implemented && runtimeAvailable && configured && definition.configuration !== "oauth";
  const blockers = [];

  if (!runtimeAvailable) blockers.push("runtime_not_supported");
  if (!definition.implemented) blockers.push("adapter_not_implemented");
  if (definition.configuration === "oauth") blockers.push("oauth_token_exchange_not_implemented");
  if (definition.implemented && runtimeAvailable && !configured) blockers.push("provider_credentials_missing");

  return {
    adapterId: definition.id,
    providerIds: [...definition.providerIds],
    implemented: definition.implemented,
    runtimeAvailable,
    configured,
    executable,
    state: definition.configuration === "oauth"
      ? "oauth_skeleton"
      : adapterState(definition, context.runtime, configured),
    providers,
    blockers: unique(blockers)
  };
}

function adapterState(definition, runtime, configured) {
  if (!definition.runtimes.includes(runtime)) return "blocked";
  if (!definition.implemented) return configured ? "configured_but_adapter_missing" : "blocked";
  if (!configured) return "blocked";
  return definition.configuration === "none" ? "working_adapter" : "configured_adapter";
}

function providerConfigured(provider, definition, context) {
  if (definition.configuration === "none" || provider.auth === "none") return true;
  if (definition.configuration === "request_byok") return context.configuredProviderIds.has(provider.id);
  const envNames = definition.credentialEnv.length
    ? definition.credentialEnv
    : provider.env ? [provider.env] : [];
  return envNames.length > 0 && envNames.every(name => envPresent(context.env, name));
}

function capabilityState(evaluated) {
  const executable = evaluated.find(item => item.executable);
  if (executable) return executable.state;
  if (evaluated.some(item => item.state === "configured_but_adapter_missing")) {
    return "configured_but_adapter_missing";
  }
  if (evaluated.some(item => item.state === "oauth_skeleton")) return "oauth_skeleton";
  return "blocked";
}

function routeSummary(route) {
  if (!route) return null;
  return {
    adapterId: route.adapterId,
    providerIds: [...route.providerIds],
    state: route.state,
    implemented: route.implemented,
    configured: route.configured,
    executable: route.executable,
    blockers: [...route.blockers]
  };
}

function mergeProviders(evaluated) {
  const providers = new Map();
  for (const route of evaluated) {
    for (const provider of route.providers) {
      const existing = providers.get(provider.id);
      if (!existing || providerPriority(provider.state) > providerPriority(existing.state)) {
        providers.set(provider.id, provider);
      }
    }
  }
  return [...providers.values()];
}

function providerPriority(state) {
  return {
    working_adapter: 5,
    configured_adapter: 4,
    configured_but_adapter_missing: 3,
    oauth_skeleton: 2,
    blocked: 1
  }[state] || 0;
}

function normalizeContext(options) {
  const runtime = String(options.runtime || "server");
  if (!RUNTIMES.has(runtime)) throw new TypeError(`invalid_connector_runtime:${runtime}`);
  const catalog = readProviderCatalog();
  const configuredProviderIds = new Set(
    (Array.isArray(options.configuredProviderIds) ? options.configuredProviderIds : [])
      .map(value => String(value || "").trim())
      .filter(Boolean)
      .slice(0, 64)
  );
  return {
    runtime,
    env: options.env && typeof options.env === "object" ? options.env : process.env,
    configuredProviderIds,
    providerById: new Map(catalog.providers.map(provider => [provider.id, provider]))
  };
}

function envPresent(env, name) {
  return Object.prototype.hasOwnProperty.call(env, name)
    && typeof env[name] === "string"
    && env[name].trim().length > 0;
}

function capability(id, approvalRequired, adapters) {
  return Object.freeze({ id, approvalRequired, adapters: Object.freeze(adapters) });
}

function adapter(id, providerIds, implemented, runtimes, configuration, credentialEnv = []) {
  return Object.freeze({
    id,
    providerIds: Object.freeze(providerIds),
    implemented,
    runtimes: Object.freeze(runtimes),
    configuration,
    credentialEnv: Object.freeze(credentialEnv)
  });
}

function unique(values) {
  return [...new Set(values)];
}
