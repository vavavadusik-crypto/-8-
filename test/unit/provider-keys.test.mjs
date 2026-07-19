import assert from "node:assert/strict";
import test from "node:test";

import { createProviderKeyStore } from "../../src/local-media/provider-keys.js";

test("provider key store lists providers with honest configuration sources", () => {
  const env = { HERMEST_PEXELS_API_KEY: "environment-key-123" };
  const store = createProviderKeyStore({ env });

  const providers = store.listProviders();
  assert.deepEqual(providers.map(provider => provider.id).sort(), ["elevenlabs", "fal", "pexels"]);
  const pexels = providers.find(provider => provider.id === "pexels");
  assert.equal(pexels.configured, true);
  assert.equal(pexels.source, "environment");
  const elevenlabs = providers.find(provider => provider.id === "elevenlabs");
  assert.equal(elevenlabs.configured, false);
  assert.equal(elevenlabs.source, null);
  assert.equal(JSON.stringify(providers).includes("environment-key-123"), false);
});

test("provider key store sets session keys into the worker environment", () => {
  const env = {};
  const store = createProviderKeyStore({ env });

  const status = store.setKey("elevenlabs", "sk_0123456789abcdef");
  assert.equal(status.configured, true);
  assert.equal(status.source, "session");
  assert.equal(env.HERMEST_ELEVENLABS_API_KEY, "sk_0123456789abcdef");
  assert.equal(JSON.stringify(status).includes("sk_0123456789abcdef"), false);
});

test("provider key store clears only session keys", () => {
  const env = { HERMEST_PEXELS_API_KEY: "environment-key-123" };
  const store = createProviderKeyStore({ env });
  store.setKey("fal", "fal-key-0123456789");

  const cleared = store.clearKey("fal");
  assert.equal(cleared.configured, false);
  assert.equal(env.HERMEST_FAL_API_KEY, undefined);
  assert.throws(() => store.clearKey("pexels"), RangeError);
  assert.equal(env.HERMEST_PEXELS_API_KEY, "environment-key-123");
});

test("provider key store fails closed on unknown providers and malformed keys", () => {
  const store = createProviderKeyStore({ env: {} });

  assert.throws(() => store.setKey("openai", "sk_0123456789abcdef"), TypeError);
  assert.throws(() => store.setKey("elevenlabs", ""), TypeError);
  assert.throws(() => store.setKey("elevenlabs", "short"), TypeError);
  assert.throws(() => store.setKey("elevenlabs", "has spaces in the key"), TypeError);
  assert.throws(() => store.setKey("elevenlabs", "line\nbreak0123456789"), TypeError);
  assert.throws(() => store.setKey("elevenlabs", "x".repeat(201)), TypeError);
  assert.throws(() => store.clearKey("openai"), TypeError);
});

test("session key overrides an environment key and clearing restores nothing silently", () => {
  const env = { HERMEST_ELEVENLABS_API_KEY: "environment-key-123" };
  const store = createProviderKeyStore({ env });

  const overridden = store.setKey("elevenlabs", "sk_session0123456789");
  assert.equal(overridden.source, "session");
  assert.equal(env.HERMEST_ELEVENLABS_API_KEY, "sk_session0123456789");

  const cleared = store.clearKey("elevenlabs");
  assert.equal(cleared.configured, false);
  assert.equal(env.HERMEST_ELEVENLABS_API_KEY, undefined);
});
