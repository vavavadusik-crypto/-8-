import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createCachedImageAdapter,
  imageCacheKey,
  resolveImageCacheDirectory
} from "../../src/media/asset-cache.js";

const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  Buffer.from("fake-png-body-0123456789")
]);

function countingAdapter() {
  let calls = 0;
  return {
    provider: "fal",
    model: "fal-ai/flux/schnell",
    get calls() { return calls; },
    async generateImage({ prompt, stylePreset, width, height, seed, outputPath }) {
      calls += 1;
      await writeFile(outputPath, PNG_BYTES, { flag: "wx", mode: 0o600 });
      return {
        path: outputPath,
        sha256: createHash("sha256").update(PNG_BYTES).digest("hex"),
        bytes: PNG_BYTES.length,
        width,
        height,
        license: "fal-generated",
        provenance: {
          source: "generated",
          provider: "fal",
          model: "fal-ai/flux/schnell",
          promptSha256: createHash("sha256").update(`${stylePreset}, ${prompt}`).digest("hex"),
          seed
        }
      };
    }
  };
}

const request = Object.freeze({
  prompt: "Квантовые компьютеры простыми словами",
  stylePreset: "dark cosmos infographic",
  width: 1920,
  height: 1080,
  seed: 42
});

test("image cache key is deterministic and sensitive to every parameter", () => {
  const base = imageCacheKey({ provider: "fal", model: "m", stylePreset: "s", prompt: "p", width: 10, height: 20, seed: 1 });
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(imageCacheKey({ provider: "fal", model: "m", stylePreset: "s", prompt: "p", width: 10, height: 20, seed: 1 }), base);
  for (const change of [
    { model: "other" },
    { stylePreset: "other" },
    { prompt: "other" },
    { width: 11 },
    { height: 21 },
    { seed: 2 },
    { seed: undefined }
  ]) {
    const changed = imageCacheKey({ provider: "fal", model: "m", stylePreset: "s", prompt: "p", width: 10, height: 20, seed: 1, ...change });
    assert.notEqual(changed, base, JSON.stringify(change));
  }
});

test("cache directory resolves from env override or XDG-style default", () => {
  assert.equal(
    resolveImageCacheDirectory({ env: {}, homeDirectory: "/home/user" }),
    "/home/user/.cache/hermest-board/generated-images"
  );
  assert.equal(
    resolveImageCacheDirectory({ env: { HERMEST_ASSET_CACHE_DIR: "/tmp/custom-cache" }, homeDirectory: "/home/user" }),
    "/tmp/custom-cache"
  );
  assert.throws(
    () => resolveImageCacheDirectory({ env: { HERMEST_ASSET_CACHE_DIR: "relative/path" }, homeDirectory: "/home/user" }),
    RangeError
  );
});

test("repeated generation of the same request hits the cache with zero provider calls", async t => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "hermest-asset-cache-"));
  t.after(() => rm(workDir, { recursive: true, force: true }));
  const inner = countingAdapter();
  const adapter = createCachedImageAdapter({ adapter: inner, cacheDirectory: path.join(workDir, "cache") });

  const first = await adapter.generateImage({ ...request, outputPath: path.join(workDir, "first.png") });
  assert.equal(inner.calls, 1);

  const second = await adapter.generateImage({ ...request, outputPath: path.join(workDir, "second.png") });
  assert.equal(inner.calls, 1, "second render must not call the provider");
  assert.equal(second.sha256, first.sha256);
  assert.equal(second.bytes, first.bytes);
  assert.equal(second.license, first.license);
  assert.deepEqual(second.provenance, first.provenance);
  assert.equal(second.path, path.join(workDir, "second.png"));
  const bytes = await readFile(second.path);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), first.sha256);

  await adapter.generateImage({ ...request, prompt: "Другая тема", outputPath: path.join(workDir, "third.png") });
  assert.equal(inner.calls, 2, "a different prompt must generate anew");
});

test("corrupted cache entries are ignored and regenerated", async t => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "hermest-asset-cache-corrupt-"));
  t.after(() => rm(workDir, { recursive: true, force: true }));
  const cacheDirectory = path.join(workDir, "cache");
  const inner = countingAdapter();
  const adapter = createCachedImageAdapter({ adapter: inner, cacheDirectory });

  await adapter.generateImage({ ...request, outputPath: path.join(workDir, "first.png") });
  const key = imageCacheKey({ provider: "fal", model: "fal-ai/flux/schnell", ...request });
  await writeFile(path.join(cacheDirectory, `${key}.png`), Buffer.from("tampered"), { mode: 0o600 });

  const regenerated = await adapter.generateImage({ ...request, outputPath: path.join(workDir, "second.png") });
  assert.equal(inner.calls, 2, "tampered cache must not be served");
  assert.equal(regenerated.sha256, createHash("sha256").update(PNG_BYTES).digest("hex"));
});

test("a broken cache directory fails open to live generation with a warning", async t => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "hermest-asset-cache-broken-"));
  t.after(() => rm(workDir, { recursive: true, force: true }));
  const blockingFile = path.join(workDir, "not-a-directory");
  await writeFile(blockingFile, "block", { mode: 0o600 });
  const warnings = [];
  const inner = countingAdapter();
  const adapter = createCachedImageAdapter({
    adapter: inner,
    cacheDirectory: blockingFile,
    onWarning: message => warnings.push(message)
  });

  const result = await adapter.generateImage({ ...request, outputPath: path.join(workDir, "out.png") });
  assert.equal(inner.calls, 1);
  assert.equal(result.bytes, PNG_BYTES.length);
  assert.ok(warnings.length >= 1);
  assert.ok(warnings.every(message => !message.includes("sk_")));
});
