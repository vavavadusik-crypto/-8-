import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createFalImageAdapter, describeImageSourceAvailability } from "../../src/media/image-source.js";

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7)
]);

function jsonResponse(body, { status = 200 } = {}) {
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => bytes.toString("utf8"),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
}

function binaryResponse(bytes, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => {
      throw new Error("binary response has no text body");
    },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
}

function adapterWith(responses, env = { HERMEST_FAL_API_KEY: "fal-test-key" }) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch call");
    return next;
  };
  return { adapter: createFalImageAdapter({ env, fetchImpl }), calls };
}

test("describeImageSourceAvailability reports missing key honestly", () => {
  assert.equal(describeImageSourceAvailability({ env: {} }).status, "missing");
  assert.equal(
    describeImageSourceAvailability({ env: { HERMEST_FAL_API_KEY: "k" } }).status,
    "executable"
  );
});

test("fal adapter generates an image with style preset and provenance", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "fal-image-"));
  try {
    const outputPath = path.join(outputDir, "scene-002.png");
    const { adapter, calls } = adapterWith([
      jsonResponse({ images: [{ url: "https://fal.media/files/x/y.png", width: 1920, height: 1080 }], seed: 42 }),
      binaryResponse(PNG_BYTES)
    ]);
    const image = await adapter.generateImage({
      prompt: "квантовый компьютер в лаборатории",
      stylePreset: "cinematic dark tech, volumetric light",
      width: 1920,
      height: 1080,
      seed: 42,
      outputPath
    });
    const requestBody = JSON.parse(calls[0].options.body);
    assert.equal(calls[0].options.headers.Authorization, "Key fal-test-key");
    assert.match(requestBody.prompt, /^cinematic dark tech, volumetric light/);
    assert.match(requestBody.prompt, /квантовый компьютер/);
    assert.deepEqual(requestBody.image_size, { width: 1920, height: 1080 });
    assert.equal(requestBody.seed, 42);
    assert.equal(requestBody.num_images, 1);
    assert.equal(image.path, outputPath);
    assert.match(image.sha256, /^[0-9a-f]{64}$/);
    assert.equal(image.license, "fal-generated");
    assert.equal(image.provenance.source, "generated");
    assert.equal(image.provenance.provider, "fal");
    assert.match(image.provenance.promptSha256, /^[0-9a-f]{64}$/);
    assert.equal(image.provenance.seed, 42);
    const written = await readFile(outputPath);
    assert.equal(written.length, PNG_BYTES.length);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("fal adapter fails closed on auth, bad payloads and unsafe urls", async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), "fal-image-"));
  try {
    const outputPath = path.join(outputDir, "img.png");
    const base = { prompt: "p", width: 1024, height: 576, outputPath };

    const denied = adapterWith([jsonResponse({}, { status: 401 })]);
    await assert.rejects(denied.adapter.generateImage(base), /rejected the API key/);

    const httpUrl = adapterWith([
      jsonResponse({ images: [{ url: "http://fal.media/files/x.png" }] })
    ]);
    await assert.rejects(httpUrl.adapter.generateImage(base), /image url/i);

    const notImage = adapterWith([
      jsonResponse({ images: [{ url: "https://fal.media/files/x.png" }] }),
      binaryResponse(Buffer.from("not an image at all"))
    ]);
    await assert.rejects(notImage.adapter.generateImage(base), /image format/i);

    const empty = adapterWith([
      jsonResponse({ images: [] })
    ]);
    await assert.rejects(empty.adapter.generateImage(base), /no image/i);

    const noKey = createFalImageAdapter({ env: {}, fetchImpl: async () => jsonResponse({}) });
    await assert.rejects(noKey.generateImage(base), /not configured/);

    const badSize = adapterWith([jsonResponse({})]);
    await assert.rejects(
      badSize.adapter.generateImage({ ...base, width: 0 }),
      RangeError
    );
    await assert.rejects(
      adapterWith([jsonResponse({})]).adapter.generateImage({ ...base, prompt: "   " }),
      /prompt/i
    );
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
