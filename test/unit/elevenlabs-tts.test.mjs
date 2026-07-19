import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";

import {
  createElevenLabsNarrationAdapter,
  describeElevenLabsAvailability,
  resolveElevenLabsVoice
} from "../../src/media/elevenlabs-tts.js";
import { selectNarrationAdapter } from "../../src/media/narration.js";

const API_KEY = "unit-test-api-key-value";
const OUTPUT = "/tmp/hermest-test-run/narration.raw.wav";
const AUDIO_BYTES = Uint8Array.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 10]);

function okResponse(bytes = AUDIO_BYTES) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
}

function errorResponse(status) {
  return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) };
}

function recordingFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const impl = async (url, options) => {
    calls.push({ url, options });
    if (queue.length === 0) throw new Error("unexpected extra fetch call");
    return queue.shift();
  };
  return { impl, calls };
}

function recordingDependencies(fetch, overrides = {}) {
  const written = [];
  const slept = [];
  return {
    written,
    slept,
    dependencies: {
      fetchImpl: fetch.impl,
      apiKeyProvider: async () => API_KEY,
      writeBytes: async (filePath, bytes) => { written.push({ filePath, bytes }); },
      probeFile: async () => ({
        durationSeconds: 3.2,
        audio: { sampleRate: 44100, channels: 1, codec: "mp3" }
      }),
      sleep: async ms => { slept.push(ms); },
      ...overrides
    }
  };
}

test("ElevenLabs adapter synthesizes through mocked HTTP and returns auditable metadata", async () => {
  const fetch = recordingFetch([okResponse()]);
  const { dependencies, written } = recordingDependencies(fetch);
  const adapter = createElevenLabsNarrationAdapter(dependencies);
  const script = "Любой язык мира — одним и тем же конвейером.";

  const meta = await adapter.synthesize({
    text: script,
    language: "ru",
    outputPath: OUTPUT
  });

  assert.equal(fetch.calls.length, 1);
  assert.match(fetch.calls[0].url, /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/[A-Za-z0-9]+\?output_format=/);
  assert.equal(fetch.calls[0].options.headers["xi-api-key"], API_KEY);
  const body = JSON.parse(fetch.calls[0].options.body);
  assert.equal(body.model_id, "eleven_multilingual_v2");
  assert.equal(body.text, script);
  assert.equal(written.length, 1);
  assert.equal(written[0].filePath, OUTPUT);
  assert.ok(written[0].bytes.length > 0);
  assert.equal(meta.provider, "elevenlabs");
  assert.equal(meta.model, "eleven_multilingual_v2");
  assert.equal(meta.voice, resolveElevenLabsVoice());
  assert.equal(meta.language, "ru");
  assert.equal(meta.durationSeconds, 3.2);
  assert.equal(meta.characterCount, script.length);
  assert.equal(meta.scriptSha256, createHash("sha256").update(script).digest("hex"));
  assert.equal(meta.command, null);
  assert.equal(JSON.stringify(meta).includes(API_KEY), false);
});

test("ElevenLabs adapter enforces the per-job character budget before spending money", async () => {
  const fetch = recordingFetch([okResponse()]);
  const { dependencies } = recordingDependencies(fetch, { maxCharactersPerJob: 10 });
  const adapter = createElevenLabsNarrationAdapter(dependencies);

  await assert.rejects(
    () => adapter.synthesize({
      text: "этот текст заведомо длиннее бюджета",
      language: "ru",
      outputPath: OUTPUT
    }),
    RangeError
  );
  assert.equal(fetch.calls.length, 0);
});

test("ElevenLabs adapter retries transient failures with backoff", async () => {
  const fetch = recordingFetch([errorResponse(429), okResponse()]);
  const { dependencies, slept } = recordingDependencies(fetch);
  const adapter = createElevenLabsNarrationAdapter(dependencies);

  const meta = await adapter.synthesize({ text: "retry me", language: "en", outputPath: OUTPUT });

  assert.equal(fetch.calls.length, 2);
  assert.equal(slept.length, 1);
  assert.ok(slept[0] > 0);
  assert.equal(meta.provider, "elevenlabs");
});

test("ElevenLabs adapter fails closed on auth errors without retry or key leakage", async () => {
  const fetch = recordingFetch([errorResponse(401)]);
  const { dependencies } = recordingDependencies(fetch);
  const adapter = createElevenLabsNarrationAdapter(dependencies);

  await assert.rejects(
    () => adapter.synthesize({ text: "auth check", language: "en", outputPath: OUTPUT }),
    error => error instanceof RangeError
      && /API key/i.test(error.message)
      && !error.message.includes(API_KEY)
  );
  assert.equal(fetch.calls.length, 1);
});

test("ElevenLabs adapter refuses to run without a configured key", async () => {
  const fetch = recordingFetch([okResponse()]);
  const { dependencies } = recordingDependencies(fetch, { apiKeyProvider: async () => "" });
  const adapter = createElevenLabsNarrationAdapter(dependencies);

  await assert.rejects(
    () => adapter.synthesize({ text: "no key", language: "en", outputPath: OUTPUT }),
    /not configured/
  );
  assert.equal(fetch.calls.length, 0);
});

test("ElevenLabs voice ids validate fail-closed", () => {
  assert.equal(typeof resolveElevenLabsVoice(), "string");
  assert.equal(resolveElevenLabsVoice("pNInz6obpgDQGcFmaJgB"), "pNInz6obpgDQGcFmaJgB");
  assert.throws(() => resolveElevenLabsVoice("../evil"), TypeError);
  assert.throws(() => resolveElevenLabsVoice("id with spaces"), TypeError);
  assert.throws(() => resolveElevenLabsVoice(42), TypeError);
});

test("ElevenLabs availability and narration selector integration", async () => {
  assert.equal(describeElevenLabsAvailability({ env: {} }).status, "missing_api_key");
  assert.equal(
    describeElevenLabsAvailability({ env: { HERMEST_ELEVENLABS_API_KEY: API_KEY } }).status,
    "executable"
  );

  const adapter = await selectNarrationAdapter({
    language: "ja",
    provider: "elevenlabs",
    dependencies: { env: { HERMEST_ELEVENLABS_API_KEY: API_KEY } }
  });
  assert.equal(adapter.id, "elevenlabs");

  await assert.rejects(
    () => selectNarrationAdapter({ provider: "elevenlabs", dependencies: { env: {} } }),
    /not executable/
  );
});
