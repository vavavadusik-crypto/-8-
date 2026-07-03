import { getAuthStatus } from "./auth.js";
import { getStorageStatus } from "./storage.js";

export function getProductReadiness() {
  const storage = getStorageStatus();
  const auth = getAuthStatus();
  const durableDbConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const objectStorageConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const tokenEncryptionConfigured = Boolean(process.env.HERMEST_TOKEN_ENCRYPTION_KEY);
  const sessionSecretConfigured = Boolean(process.env.HERMEST_SESSION_SECRET);
  const connectors = connectorReadiness();
  const blockers = [
    !durableDbConfigured && "durable_database_not_configured",
    "durable_storage_adapter_not_implemented",
    !objectStorageConfigured && "object_storage_not_configured",
    !sessionSecretConfigured && "session_secret_not_configured",
    "real_user_auth_not_implemented",
    "per_user_authorization_not_implemented",
    !tokenEncryptionConfigured && "token_encryption_key_not_configured",
    "encrypted_connector_token_storage_not_implemented",
    "durable_job_queue_not_implemented",
    "human_publish_approval_flow_not_implemented",
    !connectors.youtube.configured && "youtube_connector_not_configured",
    !connectors.tiktok.configured && "tiktok_connector_not_configured",
    !connectors.instagram.configured && "instagram_connector_not_configured"
  ].filter(Boolean);

  return {
    ok: true,
    status: "alpha_blocked_for_production_writes",
    version: "0.2.0",
    launchReady: false,
    canAcceptPrivateData: false,
    canWriteProductionProjects: false,
    canRunAgentJobs: false,
    canAutopublish: false,
    storage: {
      ...storage,
      durableDbConfigured,
      objectStorageConfigured,
      adapterInterfaceImplemented: true,
      durableAdapterImplemented: storage.durableAdapterImplemented
    },
    auth: {
      ...auth,
      sessionSecretConfigured,
      realUserAuthImplemented: false,
      authorizationImplemented: false
    },
    secrets: {
      tokenEncryptionConfigured,
      valuesExposed: false
    },
    connectors,
    gates: [
      gate("public_alpha_demo", true, "Static board, read-only APIs, localStorage, export/import, and dry-run planning are available."),
      gate("production_project_writes", false, "Needs durable database adapter, real auth, authorization, and live unauthorized-path tests."),
      gate("private_media_storage", false, "Needs object storage, upload validation, rights metadata, and per-user access control."),
      gate("agent_job_execution", false, "Needs durable queue, workers, retries, cancellation, and audit records."),
      gate("autopublishing", false, "Needs OAuth token storage, provider policy checks, human approval, and disconnect/revoke flows.")
    ],
    blockers,
    nextRequiredWork: [
      "Choose and connect durable database storage.",
      "Implement user sessions and workspace ownership.",
      "Enforce authorization on every product route.",
      "Encrypt connector tokens server-side.",
      "Add durable job queue and approval-gated workers.",
      "Extend live verification with authorized and unauthorized flows."
    ]
  };
}

function connectorReadiness() {
  return {
    youtube: provider("youtube", ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REDIRECT_URI"]),
    tiktok: provider("tiktok", ["TIKTOK_CLIENT_ID", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI"]),
    instagram: provider("instagram", ["META_APP_ID", "META_APP_SECRET", "META_REDIRECT_URI"]),
    openai: provider("openai", ["OPENAI_API_KEY"])
  };
}

function provider(id, envVars) {
  const missing = envVars.filter(name => !process.env[name]);
  return {
    id,
    configured: missing.length === 0,
    missing,
    secretValuesExposed: false
  };
}

function gate(id, ready, note) {
  return {
    id,
    ready,
    note
  };
}
