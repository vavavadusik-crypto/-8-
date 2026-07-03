import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

export function getTokenVaultStatus() {
  return {
    implemented: true,
    encryptionConfigured: Boolean(process.env.HERMEST_TOKEN_ENCRYPTION_KEY),
    plaintextTokenStorageAllowed: false,
    valuesExposed: false
  };
}

export function requireTokenVault() {
  const status = getTokenVaultStatus();
  if (status.encryptionConfigured) return status;

  const error = new Error("token_encryption_key_not_configured");
  error.status = 501;
  error.code = "token_encryption_key_not_configured";
  error.note = "Set HERMEST_TOKEN_ENCRYPTION_KEY before storing OAuth connector tokens.";
  throw error;
}

export function encryptSecret(value) {
  requireTokenVault();
  const plain = String(value || "");
  if (!plain) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);

  return {
    alg: ALGORITHM,
    kid: keyId(),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };
}

export function decryptSecret(envelope) {
  requireTokenVault();
  if (!envelope) return "";
  if (envelope.alg !== ALGORITHM || !envelope.iv || !envelope.tag || !envelope.ciphertext) {
    const error = new Error("invalid_encrypted_secret");
    error.status = 500;
    error.code = "invalid_encrypted_secret";
    throw error;
  }

  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(envelope.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function redactConnector(record) {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    ownerUserId: record.ownerUserId,
    provider: record.provider,
    accountLabel: record.accountLabel || "",
    scopes: Array.isArray(record.scopes) ? record.scopes : [],
    status: record.status || "connected",
    tokenExpiresAt: record.tokenExpiresAt || null,
    accessTokenStored: Boolean(record.encryptedAccessToken),
    refreshTokenStored: Boolean(record.encryptedRefreshToken),
    tokenKeyId: record.tokenKeyId || "",
    metadata: sanitizeConnectorMetadata(record.metadata),
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export function sanitizeConnectorMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue;
    if (item && typeof item === "object") {
      result[key] = Array.isArray(item)
        ? item.slice(0, 50).map(entry => typeof entry === "object" ? "[object]" : String(entry).slice(0, 500))
        : sanitizeConnectorMetadata(item);
      continue;
    }
    result[key] = String(item ?? "").slice(0, 1000);
  }
  return result;
}

function key() {
  const raw = String(process.env.HERMEST_TOKEN_ENCRYPTION_KEY || "");
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex");

  try {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === 32) return decoded;
  } catch (_) {}

  return createHash("sha256").update(raw).digest();
}

function keyId() {
  return createHash("sha256").update(key()).digest("base64url").slice(0, 12);
}

function isSensitiveKey(key) {
  return /(token|secret|password|passwd|credential|authorization|auth|key|code)/i.test(String(key || ""));
}
