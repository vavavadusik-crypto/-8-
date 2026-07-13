import { readFileSync } from "node:fs";

const CATALOG_URL = new URL("../../public/api-provider-catalog.json", import.meta.url);

export function readProviderCatalog() {
  try {
    const data = JSON.parse(readFileSync(CATALOG_URL, "utf8"));
    return {
      schema: String(data.schema || "hermest.api-provider-catalog.v1"),
      providers: normalizeProviders(data.providers)
    };
  } catch {
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
