import { readFileSync } from "node:fs";

export default function handler(_request, response) {
  const catalog = readProviderCatalog();
  response.status(200).json({
    ok: true,
    userVisibleFields: [
      {
        key: "displayName",
        label: "Display name",
        secret: false
      },
      {
        key: "preferredLanguages",
        label: "Publishing languages",
        secret: false
      },
      {
        key: "youtubeChannel",
        label: "YouTube channel",
        secret: false
      },
      {
        key: "tiktokAccount",
        label: "TikTok account",
        secret: false
      },
      {
        key: "instagramAccount",
        label: "Instagram professional account",
        secret: false
      },
      {
        key: "openaiApiKey",
        label: "User-owned OpenAI API key for BYOK AI requests",
        secret: true,
        browserOnly: true
      },
      {
        key: "personalApiKeys",
        label: "Optional user-owned API keys for parser/media/translation/workflow modules",
        secret: true,
        browserOnly: true
      }
    ],
    hiddenServerSideSecrets: [
      "YOUTUBE_CLIENT_SECRET",
      "TIKTOK_CLIENT_SECRET",
      "META_APP_SECRET",
      "OPENAI_API_KEY",
      "DATABASE_URL",
      "BLOB_READ_WRITE_TOKEN"
    ],
    apiProviderCatalog: catalog.providers,
    apiProviderCategories: [...new Set(catalog.providers.map(provider => provider.category))],
    note: "Users should connect platform accounts through OAuth. Alpha BYOK keys are user-owned browser settings; owner secrets and platform app secrets must stay hidden server-side."
  });
}

function readProviderCatalog() {
  try {
    const url = new URL("../../public/api-provider-catalog.json", import.meta.url);
    const data = JSON.parse(readFileSync(url, "utf8"));
    return {
      schema: data.schema || "hermest.api-provider-catalog.v1",
      providers: normalizeProviders(data.providers)
    };
  } catch (_) {
    return { schema: "hermest.api-provider-catalog.v1", providers: [] };
  }
}

function normalizeProviders(providers) {
  return (Array.isArray(providers) ? providers : []).map(provider => ({
    id: String(provider.id || "").trim(),
    name: String(provider.name || "").trim(),
    category: String(provider.category || "other").trim(),
    auth: String(provider.auth || "api_key").trim(),
    freeMode: String(provider.freeMode || "unknown").trim(),
    env: String(provider.env || "").trim(),
    docs: String(provider.docs || "").trim(),
    signup: String(provider.signup || "").trim(),
    use: String(provider.use || "").trim(),
    status: String(provider.status || "key_slot").trim()
  })).filter(provider => provider.id && provider.name);
}
