import assert from "node:assert/strict";
import test from "node:test";

import { createFliteNarrationAdapter } from "../../src/media/tts.js";

test("Flite narration adapter returns auditable metadata and cleans plaintext input", async () => {
  const events = [];
  const adapter = createFliteNarrationAdapter({
    writeText: async (filePath, value, options) => events.push(["write", filePath, value, options]),
    removeFile: async filePath => events.push(["remove", filePath]),
    runTool: async (tool, args, options) => events.push(["run", tool, args, options]),
    probeFile: async () => ({
      durationSeconds: 4.25,
      audio: { codec: "pcm_s16le", sampleRate: 48000, channels: 1 }
    })
  });
  const controller = new AbortController();
  const result = await adapter.synthesize({
    text: "Проверка настоящей озвучки.",
    language: "ru",
    voice: "slt",
    outputPath: "/tmp/hermest-board-run/narration.wav",
    signal: controller.signal
  });

  assert.equal(result.provider, "ffmpeg-flite");
  assert.equal(result.model, "flite");
  assert.equal(result.voice, "slt");
  assert.equal(result.language, "ru");
  assert.equal(result.durationSeconds, 4.25);
  assert.equal(result.sampleRate, 48000);
  assert.equal(result.channels, 1);
  assert.match(result.scriptSha256, /^[a-f0-9]{64}$/);
  assert.ok(result.warnings.includes("offline_flite_voice_is_english_only"));
  assert.equal(events[0][0], "write");
  assert.equal(events[0][3].mode, 0o600);
  assert.equal(events[1][0], "run");
  assert.equal(events[1][3].signal, controller.signal);
  assert.deepEqual(events.at(-1).slice(0, 2), ["remove", "/tmp/hermest-board-run/narration.txt"]);
});

test("Flite narration adapter honors a pre-aborted signal without writing plaintext", async () => {
  let wrote = false;
  const adapter = createFliteNarrationAdapter({
    writeText: async () => { wrote = true; },
    removeFile: async () => {},
    runTool: async () => {},
    probeFile: async () => ({ audio: {} })
  });
  const controller = new AbortController();
  controller.abort(new Error("cancelled"));

  await assert.rejects(
    () => adapter.synthesize({
      text: "Do not write",
      language: "en",
      voice: "slt",
      outputPath: "/tmp/hermest-board-run/narration.wav",
      signal: controller.signal
    }),
    /cancelled|aborted/i
  );
  assert.equal(wrote, false);
});
