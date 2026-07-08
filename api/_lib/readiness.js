import { getAccountAuthStatus } from "./accounts.js";
import { getAuthStatus } from "./auth.js";
import { getOAuthStateStatus } from "./oauth-state.js";
import { getStorageStatus } from "./storage.js";
import { getTokenVaultStatus } from "./token-vault.js";

export function getProductReadiness() {
  const storage = getStorageStatus();
  const auth = getAuthStatus();
  const accountAuth = getAccountAuthStatus();
  const durableDbConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const objectStorageConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const tokenEncryptionConfigured = Boolean(process.env.HERMEST_TOKEN_ENCRYPTION_KEY);
  const sessionSecretConfigured = Boolean(process.env.HERMEST_SESSION_SECRET);
  const oauth = getOAuthStateStatus();
  const tokenVault = getTokenVaultStatus();
  const connectors = connectorReadiness();
  const blockers = [
    !durableDbConfigured && "durable_database_not_configured",
    !storage.durableAdapterImplemented && "durable_storage_adapter_not_implemented",
    storage.durableAdapterImplemented && !storage.durableAdapterConfigured && "durable_storage_adapter_not_configured",
    storage.durableAdapterConfigured && !storage.durableAdapterEnabled && "durable_storage_adapter_not_enabled",
    !objectStorageConfigured && "object_storage_not_configured",
    !sessionSecretConfigured && "session_secret_not_configured",
    !accountAuth.enabled && "account_auth_not_enabled",
    accountAuth.enabled && !accountAuth.sessionSecretConfigured && "account_session_secret_not_configured",
    accountAuth.enabled && !accountAuth.storageWriteEnabled && "account_storage_not_writable",
    !tokenEncryptionConfigured && "token_encryption_key_not_configured",
    !oauth.stateSecretConfigured && "oauth_state_secret_not_configured",
    !tokenVault.implemented && "encrypted_connector_token_storage_not_implemented",
    "oauth_token_exchange_not_implemented",
    "connector_disconnect_flow_not_implemented",
    "durable_job_queue_not_implemented",
    "approval_gated_worker_not_implemented",
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
      durableAdapterImplemented: storage.durableAdapterImplemented,
      durableAdapterConfigured: storage.durableAdapterConfigured,
      durableAdapterEnabled: storage.durableAdapterEnabled
    },
    auth: {
      ...auth,
      sessionSecretConfigured,
      signedSessionVerifierImplemented: auth.session.verifierImplemented,
      signedSessionIssuerImplemented: auth.session.issuerImplemented,
      realUserAuthImplemented: accountAuth.implemented,
      realUserAuthEnabled: accountAuth.enabled,
      realUserAuthReady: accountAuth.ready,
      accountAuth,
      authorizationImplemented: true
    },
    secrets: {
      tokenEncryptionConfigured,
      valuesExposed: false
    },
    oauth,
    tokenVault,
    jobs: {
      approvalGateImplemented: true,
      durableQueueImplemented: false,
      approvalGatedWorkerImplemented: false
    },
    connectors,
    gates: [
      gate("public_alpha_demo", true, "Static board, read-only APIs, localStorage, export/import, and dry-run planning are available."),
      gate("production_project_writes", false, "Needs durable database adapter, account auth enabled, live unauthorized-path tests, and production env verification."),
      gate("private_media_storage", false, "Needs object storage, upload validation, rights metadata, and per-user access control."),
      gate("agent_job_execution", false, "Needs durable queue, workers, retries, cancellation, and audit records."),
      gate("autopublishing", false, "Needs OAuth token exchange, provider policy checks, approval-gated workers, and disconnect/revoke flows.")
    ],
    blockers,
    nextRequiredWork: [
      "Choose and connect durable database storage.",
      "Enable account auth with HERMEST_ACCOUNT_AUTH=1, HERMEST_SESSION_SECRET, and durable writable storage.",
      "Verify user sessions and workspace ownership against live unauthorized-path tests.",
      "Encrypt connector tokens server-side.",
      "Implement OAuth token exchange and connector disconnect flows.",
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
