const ORIGINAL_ENV = { ...process.env };

const MANAGED_KEYS = [
  "VERCEL",
  "HERMEST_ENABLE_DEMO_STORAGE",
  "HERMEST_ENABLE_DURABLE_STORAGE",
  "HERMEST_STORAGE_ADAPTER",
  "HERMEST_OWNER_TOKEN",
  "HERMEST_SESSION_SECRET",
  "HERMEST_OAUTH_STATE_SECRET",
  "HERMEST_TOKEN_ENCRYPTION_KEY",
  "HERMEST_DATA_DIR",
  "DATABASE_URL",
  "POSTGRES_URL",
  "BLOB_READ_WRITE_TOKEN"
];

export function withEnv(overrides, run) {
  for (const key of MANAGED_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) continue;
    process.env[key] = String(value);
  }
  const restore = () => {
    for (const key of MANAGED_KEYS) {
      if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
      else process.env[key] = ORIGINAL_ENV[key];
    }
  };
  try {
    const result = run();
    if (result && typeof result.then === "function") return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

export function requestWith(headers = {}) {
  return { headers };
}
