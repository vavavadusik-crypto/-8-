import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createId, getStorageStatus, listRecords, saveRecord } from "./storage.js";

const scryptAsync = promisify(scrypt);
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 200;
const HASH_KEY_LENGTH = 64;

export function getAccountAuthStatus() {
  const storage = getStorageStatus();
  const enabled = process.env.HERMEST_ACCOUNT_AUTH === "1";
  const sessionSecretConfigured = Boolean(process.env.HERMEST_SESSION_SECRET);
  const ready = enabled && sessionSecretConfigured && storage.writeEnabled;
  const blockers = [
    !enabled && "account_auth_not_enabled",
    enabled && !sessionSecretConfigured && "account_session_secret_not_configured",
    enabled && !storage.writeEnabled && "account_storage_not_writable"
  ].filter(Boolean);

  return {
    implemented: true,
    enabled,
    ready,
    sessionSecretConfigured,
    storageWriteEnabled: storage.writeEnabled,
    passwordHashing: "scrypt",
    cookieSession: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    blockers
  };
}

export async function createAccount(body = {}) {
  requireAccountAuthReady();
  const email = normalizeEmail(body.email);
  const displayName = normalizeDisplayName(body.displayName || body.name || email.split("@")[0]);
  const password = normalizePassword(body.password);
  const existing = await findAccountByEmail(email);
  if (existing) {
    const error = new Error("account_email_already_exists");
    error.status = 409;
    error.code = "account_email_already_exists";
    error.note = "Use login for this email or choose another account email.";
    throw error;
  }

  const now = new Date().toISOString();
  const id = createId("usr");
  const workspaceId = createId("wks");
  const account = {
    id,
    workspaceId,
    ownerUserId: id,
    email,
    displayName,
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  };
  await saveRecord("users", account);
  return redactAccount(account);
}

export async function verifyAccountCredentials(body = {}) {
  requireAccountAuthReady();
  const email = normalizeEmail(body.email);
  const password = normalizePassword(body.password, { enforceLength: false });
  const account = await findAccountByEmail(email);
  if (!account || !await verifyPassword(password, account.passwordHash)) {
    const error = new Error("invalid_account_credentials");
    error.status = 401;
    error.code = "invalid_account_credentials";
    error.note = "Email or password is incorrect.";
    throw error;
  }

  const updated = {
    ...account,
    lastLoginAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await saveRecord("users", updated);
  return redactAccount(updated);
}

export async function findAccountByEmail(emailInput) {
  const email = normalizeEmail(emailInput);
  const users = await listRecords("users");
  return users.find(user => String(user.email || "").toLowerCase() === email) || null;
}

export function redactAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    workspaceId: account.workspaceId,
    ownerUserId: account.ownerUserId || account.id,
    email: account.email,
    displayName: account.displayName,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    lastLoginAt: account.lastLoginAt
  };
}

function requireAccountAuthReady() {
  const status = getAccountAuthStatus();
  if (status.ready) return status;

  const error = new Error(status.blockers[0] || "account_auth_not_ready");
  error.status = 501;
  error.code = status.blockers[0] || "account_auth_not_ready";
  error.note = "Set HERMEST_ACCOUNT_AUTH=1, HERMEST_SESSION_SECRET, and safe writable storage before using account login.";
  error.accountAuth = status;
  throw error;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const hash = await scryptAsync(password, salt, HASH_KEY_LENGTH);
  return {
    algo: "scrypt",
    keyLength: HASH_KEY_LENGTH,
    salt,
    hash: Buffer.from(hash).toString("base64url")
  };
}

async function verifyPassword(password, passwordHash) {
  if (!passwordHash || passwordHash.algo !== "scrypt" || !passwordHash.salt || !passwordHash.hash) return false;
  const keyLength = Number(passwordHash.keyLength || HASH_KEY_LENGTH);
  const actual = await scryptAsync(password, passwordHash.salt, keyLength);
  const expected = Buffer.from(String(passwordHash.hash), "base64url");
  const actualBuffer = Buffer.from(actual);
  return expected.length === actualBuffer.length && timingSafeEqual(actualBuffer, expected);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("invalid_account_email");
    error.status = 400;
    error.code = "invalid_account_email";
    error.note = "Use a valid email address.";
    throw error;
  }
  return email;
}

function normalizeDisplayName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 120);
  return name || "Hermest user";
}

function normalizePassword(value, options = {}) {
  const password = String(value || "");
  const enforceLength = options.enforceLength !== false;
  if (!password || password.length > MAX_PASSWORD_LENGTH || (enforceLength && password.length < MIN_PASSWORD_LENGTH)) {
    const error = new Error("account_password_policy_failed");
    error.status = 400;
    error.code = "account_password_policy_failed";
    error.note = `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters.`;
    throw error;
  }
  return password;
}
