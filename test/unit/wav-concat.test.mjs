import assert from "node:assert/strict";
import test from "node:test";

import { concatNarrationWavBuffers } from "../../src/media/wav-concat.js";

function pcmWav(frames, { sampleRate = 48000, channels = 1, bits = 16, fill = 0x11 } = {}) {
  const dataSize = frames * channels * (bits / 8);
  const buffer = Buffer.alloc(44 + dataSize, 0);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bits / 8), 28);
  buffer.writeUInt16LE(channels * (bits / 8), 32);
  buffer.writeUInt16LE(bits, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  buffer.fill(fill, 44);
  return buffer;
}

test("wav concat pads every scene to its storyboard duration with silence", () => {
  const first = pcmWav(480, { fill: 0x11 });
  const second = pcmWav(960, { fill: 0x22 });

  const combined = concatNarrationWavBuffers([first, second], [30, 25]);

  assert.equal(combined.toString("ascii", 0, 4), "RIFF");
  assert.equal(combined.toString("ascii", 8, 12), "WAVE");
  const dataSize = combined.readUInt32LE(40);
  assert.equal(dataSize, (30 + 25) * 48 * 2);
  assert.equal(combined.length, 44 + dataSize);
  assert.equal(combined.readUInt32LE(24), 48000);
  assert.equal(combined.readUInt16LE(22), 1);

  const scene1Bytes = 30 * 48 * 2;
  assert.equal(combined[44], 0x11);
  assert.ok(combined.subarray(44 + 480 * 2, 44 + scene1Bytes).every(byte => byte === 0));
  assert.equal(combined[44 + scene1Bytes], 0x22);
  assert.ok(combined.subarray(44 + scene1Bytes + 960 * 2).every(byte => byte === 0));
});

test("wav concat keeps full narration when a scene duration undershoots the audio", () => {
  const audio = pcmWav(960, { fill: 0x33 });

  const combined = concatNarrationWavBuffers([audio], [10]);

  assert.equal(combined.readUInt32LE(40), 960 * 2);
});

test("wav concat fails closed on non-canonical or mismatched input", () => {
  assert.throws(() => concatNarrationWavBuffers([pcmWav(48, { channels: 2 })], [10]), TypeError);
  assert.throws(() => concatNarrationWavBuffers([pcmWav(48, { sampleRate: 22050 })], [10]), TypeError);
  assert.throws(() => concatNarrationWavBuffers([pcmWav(48, { bits: 8 })], [10]), TypeError);
  assert.throws(() => concatNarrationWavBuffers([Buffer.from("nope")], [10]), TypeError);
  assert.throws(() => concatNarrationWavBuffers([], []), TypeError);
  assert.throws(() => concatNarrationWavBuffers([pcmWav(48)], [10, 20]), TypeError);
  assert.throws(() => concatNarrationWavBuffers([pcmWav(48)], [0]), TypeError);
});
