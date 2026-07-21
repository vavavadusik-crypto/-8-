import assert from "node:assert/strict";
import test from "node:test";

import { createBridgeTextModel, describeBridgeAvailability } from "../../src/media/text-model.js";

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}

function postResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: JSON.stringify(body)
  };
}

test("bridge text model posts openai-compatible messages and returns content", async () => {
  const calls = [];
  const model = createBridgeTextModel({
    env: { HERMEST_BRIDGE_MODEL: "chatgpt" },
    postImpl: async (url, payload) => {
      calls.push({ url: String(url), payload });
      return postResponse({ choices: [{ message: { role: "assistant", content: "ответ модели" } }] });
    }
  });
  const text = await model.complete({ system: "только JSON", prompt: "тема" });
  assert.equal(text, "ответ модели");
  assert.equal(calls[0].url, "http://127.0.0.1:8788/v1/chat/completions");
  const body = calls[0].payload;
  assert.equal(body.model, "chatgpt");
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].content, "тема");
  assert.equal(body.options.requireJson, true);
  assert.equal(body.options.stableTicks, 8);
});

test("bridge text model fails closed on bad responses and remote urls", async () => {
  const failing = createBridgeTextModel({
    env: {},
    postImpl: async () => postResponse({}, { status: 502 })
  });
  await assert.rejects(failing.complete({ prompt: "x" }), /status 502/);

  const empty = createBridgeTextModel({
    env: {},
    postImpl: async () => postResponse({ choices: [{ message: { content: "" } }] })
  });
  await assert.rejects(empty.complete({ prompt: "x" }), /empty completion/);

  assert.throws(
    () => createBridgeTextModel({ env: { HERMEST_BRIDGE_URL: "https://evil.example/v1" } }),
    /local/
  );
  await assert.rejects(failing.complete({ prompt: "   " }), /prompt/i);
});

test("bridge availability is honest about a stopped bridge", async () => {
  const down = await describeBridgeAvailability({
    env: {},
    fetchImpl: async () => { throw new Error("ECONNREFUSED"); }
  });
  assert.equal(down.status, "missing");
  assert.match(down.reason, /not running/);
  assert.deepEqual(down.providers, []);
  const up = await describeBridgeAvailability({
    env: {},
    fetchImpl: async () => jsonResponse({ ok: true })
  });
  assert.equal(up.status, "executable");
});

test("bridge text model uses the explicitly selected provider", async () => {
  const calls = [];
  const model = createBridgeTextModel({
    env: { HERMEST_BRIDGE_MODEL: "chatgpt" },
    model: "deepseek",
    postImpl: async (url, payload) => {
      calls.push(payload);
      return postResponse({ choices: [{ message: { content: "ok" } }] });
    }
  });
  assert.equal(model.model, "deepseek");
  await model.complete({ prompt: "тема" });
  assert.equal(calls[0].model, "deepseek");
});

test("bridge text model falls back to the env provider and then to chatgpt", async () => {
  const calls = [];
  const postImpl = async (url, payload) => {
    calls.push(payload);
    return postResponse({ choices: [{ message: { content: "ok" } }] });
  };

  const fromEnv = createBridgeTextModel({ env: { HERMEST_BRIDGE_MODEL: "gemini" }, postImpl });
  await fromEnv.complete({ prompt: "тема" });
  assert.equal(calls[0].model, "gemini");

  const fromDefault = createBridgeTextModel({ env: {}, model: "  ", postImpl });
  await fromDefault.complete({ prompt: "тема" });
  assert.equal(calls[1].model, "chatgpt");
});

test("bridge text model rejects a model name that is not a bare provider id", async () => {
  for (const invalid of ["../evil", "a".repeat(40), "UP PER", "chat gpt", "chat_gpt"]) {
    assert.throws(
      () => createBridgeTextModel({ env: {}, model: invalid }),
      /invalid bridge model/,
      `expected rejection for ${JSON.stringify(invalid)}`
    );
  }
  assert.throws(
    () => createBridgeTextModel({ env: { HERMEST_BRIDGE_MODEL: "drop; rm -rf" } }),
    /invalid bridge model/
  );
});

test("bridge availability reports the provider list only when it is a string array", async () => {
  const up = await describeBridgeAvailability({
    env: {},
    fetchImpl: async () => jsonResponse({ ok: true, providers: ["chatgpt", "deepseek"] })
  });
  assert.equal(up.status, "executable");
  assert.deepEqual(up.providers, ["chatgpt", "deepseek"]);

  const malformed = await describeBridgeAvailability({
    env: {},
    fetchImpl: async () => jsonResponse({ ok: true, providers: [{ id: "chatgpt" }] })
  });
  assert.equal(malformed.status, "executable");
  assert.deepEqual(malformed.providers, []);

  const unparsable = await describeBridgeAvailability({
    env: {},
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => "<html>not json</html>" })
  });
  assert.equal(unparsable.status, "executable", "unreadable body must not fake an outage");
  assert.deepEqual(unparsable.providers, []);

  const broken = await describeBridgeAvailability({
    env: {},
    fetchImpl: async () => jsonResponse({}, { status: 500 })
  });
  assert.equal(broken.status, "missing");
  assert.deepEqual(broken.providers, []);
});
