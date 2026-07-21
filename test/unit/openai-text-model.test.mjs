import assert from "node:assert/strict";
import test from "node:test";

import { OPENAI_COMPATIBLE_PRESETS, createOpenAiTextModel } from "../../src/media/openai-text-model.js";

const SECRET_KEY = "sk-test-do-not-leak-0123456789";

function jsonResponse(body, { status = 200 } = {}) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => Buffer.from(text, "utf8")
  };
}

function recordingFetch(response) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return typeof response === "function" ? response() : response;
  };
  return { calls, fetchImpl };
}

test("openai-compatible model posts chat completions and returns the content", async () => {
  const { calls, fetchImpl } = recordingFetch(
    jsonResponse({ choices: [{ message: { role: "assistant", content: "ответ модели" } }] })
  );
  const model = createOpenAiTextModel({
    baseUrl: `${OPENAI_COMPATIBLE_PRESETS.groq.baseUrl}/`,
    apiKey: SECRET_KEY,
    model: "llama-3.3-70b-versatile",
    fetchImpl
  });

  const text = await model.complete({ system: "только JSON", prompt: "тема" });

  assert.equal(text, "ответ модели");
  assert.equal(model.provider, "openai-compatible");
  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${SECRET_KEY}`);
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "llama-3.3-70b-versatile");
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].role, "user");
  assert.equal(body.messages[1].content, "тема");
});

test("keyless local provider sends no Authorization header", async () => {
  const { calls, fetchImpl } = recordingFetch(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
  const model = createOpenAiTextModel({
    baseUrl: OPENAI_COMPATIBLE_PRESETS.ollama.baseUrl,
    model: "llama3.1:8b",
    fetchImpl
  });

  await model.complete({ prompt: "тема" });

  assert.equal(calls[0].url, "http://127.0.0.1:11434/v1/chat/completions");
  assert.equal("Authorization" in calls[0].options.headers, false);
});

test("baseUrl guard allows https anywhere but plain http only on loopback", async () => {
  const fetchImpl = async () => jsonResponse({ choices: [{ message: { content: "ok" } }] });
  for (const baseUrl of Object.values(OPENAI_COMPATIBLE_PRESETS).map(preset => preset.baseUrl)) {
    assert.doesNotThrow(() => createOpenAiTextModel({ baseUrl, model: "m", fetchImpl }));
  }
  assert.doesNotThrow(() => createOpenAiTextModel({ baseUrl: "http://localhost:8080/v1", model: "m", fetchImpl }));

  for (const unsafe of ["http://169.254.169.254/latest", "http://10.0.0.5/v1", "http://evil.example/v1"]) {
    assert.throws(
      () => createOpenAiTextModel({ baseUrl: unsafe, model: "m", fetchImpl }),
      RangeError,
      `expected rejection for ${unsafe}`
    );
  }
  for (const invalid of ["ftp://api.example/v1", "evil", "", "  ", undefined, 42]) {
    assert.throws(
      () => createOpenAiTextModel({ baseUrl: invalid, model: "m", fetchImpl }),
      RangeError,
      `expected rejection for ${JSON.stringify(invalid)}`
    );
  }
});

test("a rejected key never leaks into the error message", async () => {
  const model = createOpenAiTextModel({
    baseUrl: "https://api.openai.com/v1",
    apiKey: SECRET_KEY,
    model: "gpt-4o-mini",
    fetchImpl: async () => jsonResponse({ error: { message: `invalid api key ${SECRET_KEY}` } }, { status: 401 })
  });

  await assert.rejects(model.complete({ prompt: "тема" }), error => {
    assert.match(error.message, /provider rejected the API key/);
    assert.equal(error.message.includes(SECRET_KEY), false, "the key must never reach the error text");
    return true;
  });
});

test("openai-compatible model fails closed on bad status, empty completion and empty prompt", async () => {
  const failing = createOpenAiTextModel({
    baseUrl: "https://api.mistral.ai/v1",
    apiKey: SECRET_KEY,
    model: "mistral-small-latest",
    fetchImpl: async () => jsonResponse({}, { status: 502 })
  });
  await assert.rejects(failing.complete({ prompt: "тема" }), /provider returned status 502/);

  const empty = createOpenAiTextModel({
    baseUrl: "https://api.deepseek.com",
    apiKey: SECRET_KEY,
    model: "deepseek-chat",
    fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "   " } }] })
  });
  await assert.rejects(empty.complete({ prompt: "тема" }), /empty completion/);
  await assert.rejects(empty.complete({ prompt: "   " }), /prompt is required/);
});

test("model name is required, bounded and free of control characters", async () => {
  const fetchImpl = async () => jsonResponse({ choices: [{ message: { content: "ok" } }] });
  for (const invalid of ["", "   ", undefined, 7, "a".repeat(129), "gpt\n4o"]) {
    assert.throws(
      () => createOpenAiTextModel({ baseUrl: "https://api.openai.com/v1", model: invalid, fetchImpl }),
      RangeError,
      `expected rejection for ${JSON.stringify(invalid)}`
    );
  }
  const model = createOpenAiTextModel({
    baseUrl: "https://router.huggingface.co/v1",
    apiKey: ` ${SECRET_KEY} `,
    model: "  meta-llama/Llama-3.1-8B-Instruct  ",
    fetchImpl
  });
  assert.equal(model.model, "meta-llama/Llama-3.1-8B-Instruct");
  assert.throws(
    () => createOpenAiTextModel({ baseUrl: "https://api.openai.com/v1", apiKey: "sk\nInjected: 1", model: "m", fetchImpl }),
    RangeError
  );
});
