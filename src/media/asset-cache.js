import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { assertSafeGeneratedPath } from "./ffmpeg-args.js";

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const SAFE_ABSOLUTE_PATH = /^\/[A-Za-z0-9_./-]+$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function resolveImageCacheDirectory({ env = process.env, homeDirectory = os.homedir() } = {}) {
  const configured = typeof env.HERMEST_ASSET_CACHE_DIR === "string" ? env.HERMEST_ASSET_CACHE_DIR.trim() : "";
  if (configured) {
    if (!SAFE_ABSOLUTE_PATH.test(configured)) {
      throw new RangeError("HERMEST_ASSET_CACHE_DIR must be a safe absolute path");
    }
    return configured;
  }
  return path.join(homeDirectory, ".cache", "hermest-board", "generated-images");
}

export function imageCacheKey({ provider, model, stylePreset, prompt, width, height, seed }) {
  return createHash("sha256").update(JSON.stringify({
    provider: String(provider || ""),
    model: String(model || ""),
    stylePreset: String(stylePreset || ""),
    prompt: String(prompt || ""),
    width: Number(width) || 0,
    height: Number(height) || 0,
    seed: seed === undefined ? null : Number(seed)
  })).digest("hex");
}

// Кэш платных генераций: повторный рендер того же проекта не платит провайдеру
// повторно. Любая ошибка кэша — fail-open в живую генерацию с warning, чтобы
// сломанный кэш никогда не ронял рендер.
export function createCachedImageAdapter({
  adapter,
  cacheDirectory,
  env = process.env,
  homeDirectory = os.homedir(),
  onWarning = () => {}
} = {}) {
  if (!adapter || typeof adapter.generateImage !== "function") {
    throw new TypeError("A base image adapter is required");
  }
  const directory = cacheDirectory || resolveImageCacheDirectory({ env, homeDirectory });

  return {
    provider: adapter.provider,
    model: adapter.model,
    async generateImage(request) {
      const cacheKey = imageCacheKey({
        provider: adapter.provider,
        model: adapter.model,
        stylePreset: request?.stylePreset,
        prompt: request?.prompt,
        width: request?.width,
        height: request?.height,
        seed: request?.seed
      });
      const cached = await readCacheEntry(directory, cacheKey, onWarning);
      if (cached) {
        const outputPath = assertSafeGeneratedPath(request?.outputPath);
        await writeFile(outputPath, cached.bytes, { flag: "wx", mode: PRIVATE_FILE_MODE });
        return { ...cached.metadata, path: outputPath };
      }
      const generated = await adapter.generateImage(request);
      await storeCacheEntry(directory, cacheKey, generated, onWarning);
      return generated;
    }
  };
}

async function readCacheEntry(directory, cacheKey, onWarning) {
  const imagePath = path.join(directory, `${cacheKey}.png`);
  const metadataPath = path.join(directory, `${cacheKey}.json`);
  let bytes;
  let metadata;
  try {
    bytes = await readFile(imagePath);
    metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
      onWarning(`asset cache read failed: ${error?.code || "unknown"}`);
    }
    return null;
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (
    typeof metadata?.sha256 !== "string" ||
    !SHA256_PATTERN.test(metadata.sha256) ||
    metadata.sha256 !== sha256 ||
    Number(metadata.bytes) !== bytes.length
  ) {
    onWarning("asset cache entry failed integrity check and was evicted");
    await Promise.all([
      rm(imagePath, { force: true }),
      rm(metadataPath, { force: true })
    ]).catch(() => {});
    return null;
  }
  return { bytes, metadata };
}

async function storeCacheEntry(directory, cacheKey, generated, onWarning) {
  try {
    await mkdir(directory, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
    const bytes = await readFile(generated.path);
    const metadata = {
      sha256: generated.sha256,
      bytes: generated.bytes,
      width: generated.width,
      height: generated.height,
      license: generated.license,
      provenance: generated.provenance
    };
    const imagePath = path.join(directory, `${cacheKey}.png`);
    const metadataPath = path.join(directory, `${cacheKey}.json`);
    await writeFile(`${imagePath}.partial`, bytes, { mode: PRIVATE_FILE_MODE });
    await writeFile(`${metadataPath}.partial`, `${JSON.stringify(metadata, null, 2)}\n`, {
      encoding: "utf8",
      mode: PRIVATE_FILE_MODE
    });
    await rename(`${imagePath}.partial`, imagePath);
    await rename(`${metadataPath}.partial`, metadataPath);
  } catch (error) {
    onWarning(`asset cache write failed: ${error?.code || "unknown"}`);
  }
}
