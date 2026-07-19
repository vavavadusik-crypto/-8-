const PROVIDERS = Object.freeze({
  elevenlabs: Object.freeze({ id: "elevenlabs", label: "ElevenLabs", envVar: "HERMEST_ELEVENLABS_API_KEY" }),
  fal: Object.freeze({ id: "fal", label: "FAL.ai", envVar: "HERMEST_FAL_API_KEY" }),
  pexels: Object.freeze({ id: "pexels", label: "Pexels", envVar: "HERMEST_PEXELS_API_KEY" })
});
// Печатные ASCII без пробелов: ключи провайдеров не содержат ни юникода, ни переводов строк.
const PROVIDER_KEY_PATTERN = /^[\x21-\x7e]{8,200}$/;

// BYOK-хранилище локального worker: ключ живёт только в env текущего процесса
// до его перезапуска — не пишется на диск и никогда не возвращается наружу.
export function createProviderKeyStore({ env = process.env } = {}) {
  const sessionProviders = new Set();

  function requireProvider(providerId) {
    const provider = PROVIDERS[providerId];
    if (!provider) throw new TypeError(`Unknown BYOK provider: ${String(providerId)}`);
    return provider;
  }

  function describeProvider(provider) {
    const configured = typeof env[provider.envVar] === "string" && env[provider.envVar].length > 0;
    return {
      id: provider.id,
      label: provider.label,
      configured,
      source: configured ? (sessionProviders.has(provider.id) ? "session" : "environment") : null
    };
  }

  return Object.freeze({
    listProviders() {
      return Object.values(PROVIDERS).map(describeProvider);
    },
    setKey(providerId, key) {
      const provider = requireProvider(providerId);
      if (typeof key !== "string" || !PROVIDER_KEY_PATTERN.test(key)) {
        throw new TypeError("Provider key must be 8..200 printable ASCII characters without spaces");
      }
      env[provider.envVar] = key;
      sessionProviders.add(provider.id);
      return describeProvider(provider);
    },
    clearKey(providerId) {
      const provider = requireProvider(providerId);
      if (!sessionProviders.has(provider.id)) {
        throw new RangeError("Only keys added in this worker session can be cleared");
      }
      delete env[provider.envVar];
      sessionProviders.delete(provider.id);
      return describeProvider(provider);
    }
  });
}
