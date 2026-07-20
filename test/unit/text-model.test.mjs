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

test("bridge text model posts openai-compatible messages and returns content", async () => {
  const calls = [];
  const model = createBridgeTextModel({
    env: { HERMEST_BRIDGE_MODEL: "chatgpt" },
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return jsonResponse({ choices: [{ message: { role: "assistant", content: "ответ модели" } }] });
    }
  });
  const text = await model.complete({ system: "только JSON", prompt: "тема" });
  assert.equal(text, "ответ модели");
  assert.equal(calls[0].url, "http://127.0.0.1:8788/v1/chat/completions");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "chatgpt");
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].content, "тема");
});

test("bridge text model fails closed on bad responses and remote urls", async () => {
  const failing = createBridgeTextModel({
    env: {},
    fetchImpl: async () => jsonResponse({}, { status: 502 })
  });
  await assert.rejects(failing.complete({ prompt: "x" }), /status 502/);

  const empty = createBridgeTextModel({
    env: {},
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "" } }] })
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
  const up = await describeBridgeAvailability({
    env: {},
    fetchImpl: async () => jsonResponse({ ok: true })
  });
  assert.equal(up.status, "executable");
});
