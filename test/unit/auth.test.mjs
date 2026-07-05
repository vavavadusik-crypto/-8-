import { test } from "node:test";
import assert from "node:assert/strict";
import { getRequestActor, requireOwnerToken, requireReadAccess, requireWriteAccess } from "../../api/_lib/auth.js";
import { createSignedSessionToken } from "../../api/_lib/session.js";
import { requestWith, withEnv } from "./env-helper.mjs";

const OWNER_TOKEN = "unit-test-owner-token-value";

test("local development actor is authenticated without credentials", () => {
  withEnv({}, () => {
    const actor = getRequestActor(requestWith({}));
    assert.equal(actor.authenticated, true);
    assert.equal(actor.mode, "development");
  });
});

test("anonymous read passes on Vercel while server storage is fully disabled", () => {
  withEnv({ VERCEL: "1" }, () => {
    const actor = requireReadAccess(requestWith({}));
    assert.equal(actor.authenticated, false);
  });
});

test("demo storage reads on Vercel require configured auth", () => {
  withEnv({ VERCEL: "1", HERMEST_ENABLE_DEMO_STORAGE: "1" }, () => {
    assert.throws(() => requireReadAccess(requestWith({})), error => {
      assert.equal(error.status, 501);
      assert.equal(error.code, "read_auth_not_configured");
      return true;
    });
  });
});

test("demo storage reads on Vercel reject anonymous requests when owner token exists", () => {
  withEnv({ VERCEL: "1", HERMEST_ENABLE_DEMO_STORAGE: "1", HERMEST_OWNER_TOKEN: OWNER_TOKEN }, () => {
    assert.throws(() => requireReadAccess(requestWith({})), error => {
      assert.equal(error.status, 401);
      assert.equal(error.code, "unauthorized");
      return true;
    });
    const actor = requireReadAccess(requestWith({ authorization: `Bearer ${OWNER_TOKEN}` }));
    assert.equal(actor.mode, "owner-token");
  });
});

test("durable storage reads on Vercel require authentication", () => {
  withEnv({
    VERCEL: "1",
    HERMEST_STORAGE_ADAPTER: "postgres",
    DATABASE_URL: "postgres://unit-test-host/db",
    HERMEST_ENABLE_DURABLE_STORAGE: "1",
    HERMEST_SESSION_SECRET: "unit-secret"
  }, () => {
    assert.throws(() => requireReadAccess(requestWith({})), error => {
      assert.equal(error.status, 401);
      return true;
    });
    const token = createSignedSessionToken({ sub: "user_a", workspaceId: "workspace_a" });
    const actor = requireReadAccess(requestWith({ authorization: `Bearer ${token}` }));
    assert.equal(actor.mode, "signed-session");
    assert.equal(actor.workspaceId, "workspace_a");
  });
});

test("wrong owner token is rejected including wrong-length values", () => {
  withEnv({ VERCEL: "1", HERMEST_ENABLE_DEMO_STORAGE: "1", HERMEST_OWNER_TOKEN: OWNER_TOKEN }, () => {
    for (const bad of ["short", OWNER_TOKEN + "x", OWNER_TOKEN.slice(0, -1), ""]) {
      const actor = getRequestActor(requestWith({ authorization: `Bearer ${bad}` }));
      assert.equal(actor.authenticated, false, `token: ${bad || "<empty>"}`);
    }
  });
});

test("a signed session token is never accepted as an owner token", () => {
  withEnv({ VERCEL: "1", HERMEST_SESSION_SECRET: "unit-secret", HERMEST_OWNER_TOKEN: OWNER_TOKEN }, () => {
    const token = createSignedSessionToken({ sub: "user_a", workspaceId: "workspace_a" });
    const actor = getRequestActor(requestWith({ authorization: `Bearer ${token}` }));
    assert.equal(actor.mode, "signed-session");
    assert.throws(() => requireOwnerToken(requestWith({ authorization: `Bearer ${token}` })), error => {
      assert.equal(error.status, 401);
      return true;
    });
  });
});

test("owner token via x-hermest-owner-token header works", () => {
  withEnv({ VERCEL: "1", HERMEST_OWNER_TOKEN: OWNER_TOKEN }, () => {
    const actor = getRequestActor(requestWith({ "x-hermest-owner-token": OWNER_TOKEN }));
    assert.equal(actor.mode, "owner-token");
  });
});

test("writes without any auth guard stay open only for local development", () => {
  withEnv({}, () => {
    const actor = requireWriteAccess(requestWith({}));
    assert.equal(actor.mode, "development");
  });
  withEnv({ VERCEL: "1" }, () => {
    const actor = requireWriteAccess(requestWith({}));
    assert.equal(actor.authenticated, false);
  });
});

test("writes on Vercel with demo storage but no auth guard return 501", () => {
  withEnv({ VERCEL: "1", HERMEST_ENABLE_DEMO_STORAGE: "1" }, () => {
    assert.throws(() => requireWriteAccess(requestWith({})), error => {
      assert.equal(error.status, 501);
      assert.equal(error.code, "write_auth_not_configured");
      return true;
    });
  });
});

test("owner token guard rejects unconfigured and wrong tokens", () => {
  withEnv({}, () => {
    assert.throws(() => requireOwnerToken(requestWith({})), error => {
      assert.equal(error.status, 501);
      assert.equal(error.code, "owner_token_not_configured");
      return true;
    });
  });
  withEnv({ HERMEST_OWNER_TOKEN: OWNER_TOKEN }, () => {
    assert.throws(() => requireOwnerToken(requestWith({ authorization: "Bearer wrong" })), error => {
      assert.equal(error.status, 401);
      return true;
    });
    const actor = requireOwnerToken(requestWith({ authorization: `Bearer ${OWNER_TOKEN}` }));
    assert.equal(actor.mode, "owner-token");
  });
});
