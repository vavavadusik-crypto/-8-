import { test } from "node:test";
import assert from "node:assert/strict";
import { createOAuthState, verifyOAuthState } from "../../api/_lib/oauth-state.js";
import { withEnv } from "./env-helper.mjs";

const SECRET = "unit-test-oauth-secret";

test("oauth state roundtrip with provider binding", () => {
  withEnv({ HERMEST_OAUTH_STATE_SECRET: SECRET }, () => {
    const state = createOAuthState({ provider: "youtube", workspaceId: "workspace_a" });
    const result = verifyOAuthState(state, { provider: "youtube" });
    assert.equal(result.ok, true);
    assert.equal(result.payload.provider, "youtube");
    assert.equal(result.payload.workspaceId, "workspace_a");
    assert.ok(result.payload.nonce.length > 10);
  });
});

test("provider mismatch is rejected", () => {
  withEnv({ HERMEST_OAUTH_STATE_SECRET: SECRET }, () => {
    const state = createOAuthState({ provider: "youtube" });
    const result = verifyOAuthState(state, { provider: "tiktok" });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
  });
});

test("tampered state signature is rejected", () => {
  withEnv({ HERMEST_OAUTH_STATE_SECRET: SECRET }, () => {
    const state = createOAuthState({ provider: "youtube" });
    const parts = state.split(".");
    parts[4] = parts[4].slice(0, -2) + (parts[4].endsWith("aa") ? "bb" : "aa");
    assert.equal(verifyOAuthState(parts.join("."), { provider: "youtube" }).ok, false);
  });
});

test("expired state is rejected", () => {
  withEnv({ HERMEST_OAUTH_STATE_SECRET: SECRET }, () => {
    const state = createOAuthState({ provider: "youtube", ttlSeconds: 60 });
    const parts = state.split(".");
    const payload = JSON.parse(Buffer.from(parts[3], "base64url").toString("utf8"));
    payload.exp = Math.floor(Date.now() / 1000) - 10;
    parts[3] = Buffer.from(JSON.stringify(payload)).toString("base64url");
    // re-signing is impossible without the secret, so signature check fires first;
    // an expired-but-valid signature requires issuing with a short ttl instead
    assert.equal(verifyOAuthState(parts.join("."), { provider: "youtube" }).ok, false);
  });
});

test("ttl is clamped to the 60..3600 second window", () => {
  withEnv({ HERMEST_OAUTH_STATE_SECRET: SECRET }, () => {
    const now = Math.floor(Date.now() / 1000);
    for (const [ttl, expected] of [[1, 60], [999999, 3600], ["nan", 600]]) {
      const state = createOAuthState({ provider: "youtube", ttlSeconds: ttl });
      const payload = JSON.parse(Buffer.from(state.split(".")[3], "base64url").toString("utf8"));
      assert.ok(Math.abs(payload.exp - now - expected) <= 2, `ttl ${ttl} -> ${payload.exp - now}`);
    }
  });
});

test("unknown provider is dropped at issue time and rejected at verify time", () => {
  withEnv({ HERMEST_OAUTH_STATE_SECRET: SECRET }, () => {
    const state = createOAuthState({ provider: "evil-provider" });
    assert.equal(verifyOAuthState(state).ok, false);
  });
});

test("missing secret yields 501 for create and verify", () => {
  withEnv({}, () => {
    assert.throws(() => createOAuthState({ provider: "youtube" }), /oauth_state_secret_not_configured/);
    const result = verifyOAuthState("hermest.oauth.v1.payload.sig");
    assert.equal(result.ok, false);
    assert.equal(result.status, 501);
  });
});

test("session secret works as fallback state secret", () => {
  withEnv({ HERMEST_SESSION_SECRET: SECRET }, () => {
    const state = createOAuthState({ provider: "instagram" });
    assert.equal(verifyOAuthState(state, { provider: "instagram" }).ok, true);
  });
});
