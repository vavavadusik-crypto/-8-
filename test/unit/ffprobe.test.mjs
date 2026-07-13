import assert from "node:assert/strict";
import test from "node:test";

import {
  assertVideoProbe,
  parseProbeOutput
} from "../../src/media/ffprobe.js";

const rawProbe = JSON.stringify({
  streams: [
    { index: 0, codec_name: "h264", codec_type: "video", width: 1920, height: 1080 },
    { index: 1, codec_name: "aac", codec_type: "audio", sample_rate: "48000", channels: 2 }
  ],
  format: { duration: "5.520000", size: "120000" }
});
const recipe = {
  width: 1920,
  height: 1080,
  videoCodec: "libx264",
  audioCodec: "aac",
  audioSampleRate: 48000,
  audioChannels: 2
};

test("ffprobe parser normalizes duration, video and audio evidence", () => {
  const probe = parseProbeOutput(rawProbe);

  assert.equal(probe.durationSeconds, 5.52);
  assert.deepEqual(probe.video, { codec: "h264", width: 1920, height: 1080 });
  assert.deepEqual(probe.audio, { codec: "aac", sampleRate: 48000, channels: 2 });
  assert.equal(probe.bytes, 120000);
});

test("video probe assertion requires exact streams, codecs, dimensions and audio shape", () => {
  const probe = parseProbeOutput(rawProbe);
  assert.doesNotThrow(() => assertVideoProbe(probe, recipe, { expectedDurationSeconds: 5.52 }));
  assert.throws(() => assertVideoProbe(probe, { ...recipe, width: 1080, height: 1920 }), /dimensions/);
  assert.throws(
    () => assertVideoProbe({ durationSeconds: 2, bytes: 10, video: probe.video }, recipe),
    /audio stream/
  );
  assert.throws(
    () => assertVideoProbe({
      ...probe,
      video: { ...probe.video, codec: "vp9" },
      audio: { ...probe.audio, codec: "mp3" }
    }, recipe),
    /video codec/
  );
  assert.throws(
    () => assertVideoProbe({ ...probe, audio: { ...probe.audio, sampleRate: 44100 } }, recipe),
    /sample rate/
  );
});

test("video probe assertion enforces non-empty bytes and duration tolerance", () => {
  const probe = parseProbeOutput(rawProbe);
  assert.throws(() => assertVideoProbe({ ...probe, bytes: 0 }, recipe), /positive file size/);
  assert.throws(
    () => assertVideoProbe(probe, recipe, { expectedDurationSeconds: 7, durationToleranceSeconds: 0.25 }),
    /duration.*tolerance/i
  );
});

test("ffprobe parser rejects malformed or non-positive duration output", () => {
  assert.throws(() => parseProbeOutput("not-json"), /valid JSON/);
  assert.throws(
    () => parseProbeOutput(JSON.stringify({ streams: [], format: { duration: "0" } })),
    /positive duration/
  );
});
