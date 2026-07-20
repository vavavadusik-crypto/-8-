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

test("pexels image adapter picks the best-covering photo with provenance", async () => {
  const { createPexelsImageAdapter } = await import("../../src/media/image-source.js");
  const outputDir = await mkdtemp(path.join(tmpdir(), "pexels-image-"));
  try {
    const outputPath = path.join(outputDir, "bg.png");
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (calls.length === 1) {
        return jsonResponse({
          photos: [
            {
              id: 11,
              width: 800,
              height: 600,
              url: "https://www.pexels.com/photo/11/",
              photographer: "Автор Фото",
              src: { original: "https://images.pexels.com/photos/11/a.jpg", large2x: "https://images.pexels.com/photos/11/a-large.jpg" }
            },
            {
              id: 12,
              width: 4000,
              height: 2250,
              url: "https://www.pexels.com/photo/12/",
              photographer: "Big Author",
              src: { original: "https://images.pexels.com/photos/12/b.jpg", large2x: "https://images.pexels.com/photos/12/b-large.jpg" }
            }
          ]
        });
      }
      return binaryResponse(PNG_BYTES);
    };
    const adapter = createPexelsImageAdapter({ env: { HERMEST_PEXELS_API_KEY: "px-key" }, fetchImpl });
    const image = await adapter.generateImage({
      prompt: "квантовые компьютеры",
      width: 1920,
      height: 1080,
      outputPath
    });
    assert.equal(calls[0].options.headers.Authorization, "px-key");
    assert.match(calls[0].url, /orientation=landscape/);
    assert.match(calls[1].url, /photos\/12/);
    assert.equal(image.license, "pexels");
    assert.equal(image.provenance.source, "stock");
    assert.equal(image.provenance.provider, "pexels-photos");
    assert.equal(image.provenance.author, "Big Author");
    assert.match(image.sha256, /^[0-9a-f]{64}$/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("pexels image adapter fails closed without key, photos or safe urls", async () => {
  const { createPexelsImageAdapter } = await import("../../src/media/image-source.js");
  const outputDir = await mkdtemp(path.join(tmpdir(), "pexels-image-"));
  try {
    const base = { prompt: "тема", width: 1080, height: 1920, outputPath: path.join(outputDir, "x.png") };
    const noKey = createPexelsImageAdapter({ env: {}, fetchImpl: async () => jsonResponse({}) });
    await assert.rejects(noKey.generateImage(base), /not configured/);
    const empty = createPexelsImageAdapter({
      env: { HERMEST_PEXELS_API_KEY: "k" },
      fetchImpl: async () => jsonResponse({ photos: [] })
    });
    await assert.rejects(empty.generateImage(base), /no photo/i);
    const unsafe = createPexelsImageAdapter({
      env: { HERMEST_PEXELS_API_KEY: "k" },
      fetchImpl: async () => jsonResponse({
        photos: [{ id: 1, width: 2000, height: 3000, url: "https://www.pexels.com/photo/1/", photographer: "a", src: { original: "http://images.pexels.com/1.jpg" } }]
      })
    });
    await assert.rejects(unsafe.generateImage(base), /image url/i);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("image source cascade falls through failing adapters with warnings", async () => {
  const { createImageSourceCascade } = await import("../../src/media/image-source.js");
  const warnings = [];
  const failing = {
    provider: "fal",
    generateImage: async () => { throw new RangeError("Exhausted balance"); }
  };
  const succeeding = {
    provider: "procedural",
    generateImage: async request => ({ path: request.outputPath, sha256: "c".repeat(64), license: "generated-procedural", provenance: { source: "generated", provider: "procedural" } })
  };
  const cascade = createImageSourceCascade([failing, succeeding], { onWarning: message => warnings.push(message) });
  const image = await cascade.generateImage({ prompt: "p", width: 100, height: 100, outputPath: "/tmp/x.png" });
  assert.equal(image.provenance.provider, "procedural");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /fal.*Exhausted balance/);
  const allFail = createImageSourceCascade([failing], {});
  await assert.rejects(allFail.generateImage({ prompt: "p", width: 100, height: 100, outputPath: "/tmp/x.png" }), /Exhausted balance/);
});

test("image source availability accepts any configured provider of the cascade", () => {
  assert.equal(describeImageSourceAvailability({ env: {} }).status, "missing");
  const pexelsOnly = describeImageSourceAvailability({ env: { HERMEST_PEXELS_API_KEY: "p" } });
  assert.equal(pexelsOnly.status, "executable");
  assert.deepEqual(pexelsOnly.providers, ["pexels-photos"]);
  const both = describeImageSourceAvailability({
    env: { HERMEST_FAL_API_KEY: "f", HERMEST_PEXELS_API_KEY: "p" }
  });
  assert.deepEqual(both.providers, ["fal", "pexels-photos"]);
});

test("default image cascade is built from configured providers in paid-first order", async () => {
  const { createDefaultImageSourceCascade } = await import("../../src/media/image-source.js");
  const both = createDefaultImageSourceCascade({
    env: { HERMEST_FAL_API_KEY: "f", HERMEST_PEXELS_API_KEY: "p" }
  });
  assert.equal(both.provider, "fal+pexels-photos");
  const pexelsOnly = createDefaultImageSourceCascade({ env: { HERMEST_PEXELS_API_KEY: "p" } });
  assert.equal(pexelsOnly.provider, "pexels-photos");
  assert.throws(() => createDefaultImageSourceCascade({ env: {} }), RangeError);
});
