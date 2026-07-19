const CANONICAL_SAMPLE_RATE = 48000;
const CANONICAL_CHANNELS = 1;
const CANONICAL_BITS_PER_SAMPLE = 16;
const BYTES_PER_FRAME = (CANONICAL_CHANNELS * CANONICAL_BITS_PER_SAMPLE) / 8;
const FRAMES_PER_MS = CANONICAL_SAMPLE_RATE / 1000;
const WAV_HEADER_BYTES = 44;
const PCM_FORMAT_TAG = 1;

// Concatenates canonical narration WAVs (48 kHz mono s16le) into one file,
// zero-padding each scene to its storyboard duration so audio and scene
// boundaries stay sample-exact and the output is byte-deterministic.
export function concatNarrationWavBuffers(wavBuffers, sceneDurationsMs) {
  if (
    !Array.isArray(wavBuffers) || wavBuffers.length === 0 ||
    !Array.isArray(sceneDurationsMs) || sceneDurationsMs.length !== wavBuffers.length
  ) {
    throw new TypeError("WAV concat requires one scene duration per narration buffer");
  }

  const segments = wavBuffers.map((buffer, index) => {
    const data = extractCanonicalPcm(buffer, index);
    const durationMs = Number(sceneDurationsMs[index]);
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new TypeError(`Scene ${index + 1} requires a positive duration`);
    }
    const targetBytes = Math.max(Math.round(durationMs * FRAMES_PER_MS) * BYTES_PER_FRAME, data.length);
    const segment = Buffer.alloc(targetBytes, 0);
    data.copy(segment, 0);
    return segment;
  });

  const dataSize = segments.reduce((total, segment) => total + segment.length, 0);
  return Buffer.concat([buildCanonicalWavHeader(dataSize), ...segments]);
}

function extractCanonicalPcm(buffer, index) {
  if (!Buffer.isBuffer(buffer) || buffer.length < WAV_HEADER_BYTES ||
    buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new TypeError(`Scene ${index + 1} narration is not a RIFF/WAVE file`);
  }
  let format = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkStart + chunkSize > buffer.length) {
      throw new TypeError(`Scene ${index + 1} narration WAV is truncated`);
    }
    if (chunkId === "fmt ") {
      format = {
        formatTag: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14)
      };
    } else if (chunkId === "data") {
      data = buffer.subarray(chunkStart, chunkStart + chunkSize);
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }
  if (!format || !data) {
    throw new TypeError(`Scene ${index + 1} narration WAV is missing fmt/data chunks`);
  }
  if (
    format.formatTag !== PCM_FORMAT_TAG ||
    format.channels !== CANONICAL_CHANNELS ||
    format.sampleRate !== CANONICAL_SAMPLE_RATE ||
    format.bitsPerSample !== CANONICAL_BITS_PER_SAMPLE
  ) {
    throw new TypeError(`Scene ${index + 1} narration WAV is not canonical 48 kHz mono s16le`);
  }
  return data;
}

function buildCanonicalWavHeader(dataSize) {
  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(PCM_FORMAT_TAG, 20);
  header.writeUInt16LE(CANONICAL_CHANNELS, 22);
  header.writeUInt32LE(CANONICAL_SAMPLE_RATE, 24);
  header.writeUInt32LE(CANONICAL_SAMPLE_RATE * BYTES_PER_FRAME, 28);
  header.writeUInt16LE(BYTES_PER_FRAME, 32);
  header.writeUInt16LE(CANONICAL_BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return header;
}
