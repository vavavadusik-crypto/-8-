import { test } from "node:test";
import assert from "node:assert/strict";
import { createSignedSessionToken, readSignedSession } from "../../api/_lib/session.js";
import { requestWith, withEnv } from "./env-helper.mjs";

const SECRET = "unit-test-session-secret";

test("signed session roundtrip via Authorization header", () => {
  withEnv({ HERMEST_SESSION_SECRET: SECRET }, () => {
    const token = createSignedSessionToken({ sub: "user_a", workspaceId: "workspace_a" });
    const actor = readSignedSession(requestWith({ authorization: `Bearer ${token}` }));
    assert.equal(actor.authenticated, true);
    assert.equal(actor.id, "user_a");
    assert.equal(actor.workspaceId, "workspace_a");
    assert.equal(actor.mode, "signed-session");
  });
});

test("signed session roundtrip via cookie", () => {
  withEnv({ HERMEST_SESSION_SECRET: SECRET }, () => {
    const token = createSignedSessionToken({ sub: "user_c", workspaceId: "workspace_c" });
    const actor = readSignedSession(requestWith({ cookie: `theme=dark; hermest_session=${encodeURIComponent(token)}; other=1` }));
    assert.equal(actor.id, "user_c");
    assert.equal(actor.workspaceId, "workspace_c");
  });
});

test("tampered signature is rejected", () => {
  withEnv({ HERMEST_SESSION_SECRET: SECRET }, () => {
    const token = createSignedSessionToken({ sub: "user_a", workspaceId: "workspace_a" });
    const parts = token.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("aa") ? "bb" : "aa");
    const actor = readSignedSession(requestWith({ authorization: `Bearer ${parts.join(".")}` }));
    assert.equal(actor, null);
  });
});

test("payload tampering invalidates the signature", () => {
  withEnv({ HERMEST_SESSION_SECRET: SECRET }, () => {
    const token = createSignedSessionToken({ sub: "user_a", workspaceId: "workspace_a" });
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[2], "base64url").toString("utf8"));
    payload.workspaceId = "workspace_victim";
    parts[2] = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const actor = readSignedSession(requestWith({ authorization: `Bearer ${parts.join(".")}` }));
    assert.equal(actor, null);
  });
});

test("expired token is rejected", () => {
  withEnv({ HERMEST_SESSION_SECRET: SECRET }, () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedSessionToken({ sub: "user_a", workspaceId: "workspace_a", iat: now - 7200, exp: now - 3600 });
    const actor = readSignedSession(requestWith({ authorization: `Bearer ${token}` }));
    assert.equal(actor, null);
  });
});

test("token issued in the future is rejected", () => {
  withEnv({ HERMEST_SESSION_SECRET: SECRET }, () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedSessionToken({ sub: "user_a", workspaceId: "workspace_a", iat: now + 3600, exp: now + 7200 });
    const actor = readSignedSession(requestWith({ authorization: `Bearer ${token}` }));
    assert.equal(actor, null);
  });
});

test("malformed tokens are rejected without crashing", () => {
  withEnv({ HERMEST_SESSION_SECRET: SECRET }, () => {
    const malformed = [
      "hermest.v1",
      "hermest.v1..",
      "hermest.v1.%%%.sig",
      "hermest.v2.payload.sig",
      `Bearer hermest.v1.${Buffer.from("not json").toString("base64url")}.sig`,
      "a".repeat(10000)
    ];
    for (const token of malformed) {
      assert.equal(readSignedSession(requestWith({ authorization: `Bearer ${token}` })), null, token.slice(0, 40));
    }
  });
});

test("token signed with a different secret is rejected", () => {
  const token = withEnv({ HERMEST_SESSION_SECRET: "other-secret" }, () =>
    createSignedSessionToken({ sub: "user_a", workspaceId: "workspace_a" }));
  withEnv({ HERMEST_SESSION_SECRET: SECRET }, () => {
    assert.equal(readSignedSession(requestWith({ authorization: `Bearer ${token}` })), null);
  });
});

test("no session secret disables verification entirely", () => {
  const token = withEnv({ HERMEST_SESSION_SECRET: SECRET }, () =>
    createSignedSessionToken({ sub: "user_a", workspaceId: "workspace_a" }));
  withEnv({}, () => {
    assert.equal(readSignedSession(requestWith({ authorization: `Bearer ${token}` })), null);
  });
});

test("issuing a token without a secret throws", () => {
  withEnv({}, () => {
    assert.throws(() => createSignedSessionToken({ sub: "user_a" }), /session_secret_not_configured/);
  });
});
