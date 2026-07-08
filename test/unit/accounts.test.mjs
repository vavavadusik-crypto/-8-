import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccount, getAccountAuthStatus, verifyAccountCredentials } from "../../api/_lib/accounts.js";
import { getRecord } from "../../api/_lib/storage.js";
import { withEnv } from "./env-helper.mjs";

test("account auth stays implemented but disabled until explicitly configured", () => {
  withEnv({}, () => {
    const status = getAccountAuthStatus();
    assert.equal(status.implemented, true);
    assert.equal(status.enabled, false);
    assert.equal(status.ready, false);
    assert.deepEqual(status.blockers, ["account_auth_not_enabled"]);
  });
});

test("account creation stores a scrypt hash and returns a redacted account", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hermest-account-unit-"));
  try {
    await withEnv({
      HERMEST_ACCOUNT_AUTH: "1",
      HERMEST_SESSION_SECRET: "account-unit-session-secret",
      HERMEST_DATA_DIR: dataDir
    }, async () => {
      const account = await createAccount({
        email: "USER@Example.COM",
        displayName: "  Test   User  ",
        password: "correct horse battery"
      });

      assert.equal(account.email, "user@example.com");
      assert.equal(account.displayName, "Test User");
      assert.ok(account.id.startsWith("usr_"));
      assert.ok(account.workspaceId.startsWith("wks_"));
      assert.equal(account.passwordHash, undefined);

      const stored = await getRecord("users", account.id);
      assert.equal(stored.email, "user@example.com");
      assert.equal(stored.passwordHash.algo, "scrypt");
      assert.notEqual(JSON.stringify(stored), "correct horse battery");
      assert.equal(JSON.stringify(stored).includes("correct horse battery"), false);
    });
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("account login accepts the right password and rejects invalid credentials", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hermest-account-login-unit-"));
  try {
    await withEnv({
      HERMEST_ACCOUNT_AUTH: "1",
      HERMEST_SESSION_SECRET: "account-login-session-secret",
      HERMEST_DATA_DIR: dataDir
    }, async () => {
      const account = await createAccount({
        email: "login@example.com",
        password: "login password value"
      });
      const verified = await verifyAccountCredentials({
        email: "LOGIN@example.com",
        password: "login password value"
      });

      assert.equal(verified.id, account.id);
      assert.equal(verified.workspaceId, account.workspaceId);

      await assert.rejects(
        () => verifyAccountCredentials({ email: "login@example.com", password: "wrong password" }),
        error => {
          assert.equal(error.status, 401);
          assert.equal(error.code, "invalid_account_credentials");
          return true;
        }
      );
    });
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("account auth refuses signup when disabled or missing session secret", async () => {
  await withEnv({}, async () => {
    await assert.rejects(
      () => createAccount({ email: "off@example.com", password: "disabled password" }),
      error => {
        assert.equal(error.status, 501);
        assert.equal(error.code, "account_auth_not_enabled");
        return true;
      }
    );
  });

  await withEnv({ HERMEST_ACCOUNT_AUTH: "1" }, async () => {
    await assert.rejects(
      () => createAccount({ email: "no-secret@example.com", password: "disabled password" }),
      error => {
        assert.equal(error.status, 501);
        assert.equal(error.code, "account_session_secret_not_configured");
        return true;
      }
    );
  });
});
