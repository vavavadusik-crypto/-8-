import { createHash } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";

import { assertSafeGeneratedPath } from "./ffmpeg-args.js";
import { readBoundedBytes, readBoundedJson } from "./bounded-body.js";

const PRIVATE_FILE_MODE = 0o600;
const FAL_SYNC_URL = "https://fal.run/fal-ai/flux/schnell";
const FAL_MODEL = "fal-ai/flux/schnell";
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PROMPT_CHARS = 1200;
const MAX_DIMENSION = 2048;
const REQUEST_TIMEOUT_MS = 90000;
const DOWNLOAD_TIMEOUT_MS = 120000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

export function describeImageSourceAvailability({ env = process.env } = {}) {
  const providers = [];
  if (readFalKey(env)) providers.push("fal");
  if (readPexelsKey(env)) providers.push("pexels-photos");
  if (providers.length === 0) {
    return {
      status: "missing",
      providers,
      reason: "no image source key is configured (FAL or Pexels); scenes render without generated visuals"
    };
  }
  return { status: "executable", providers };
}

// Каскад по умолчанию: платная генерация первой (если ключ есть), бесплатный
// сток следом; каждый источник fail-open к следующему с честным warning.
export function createDefaultImageSourceCascade({ env = process.env, fetchImpl = fetch, onWarning } = {}) {
  const adapters = [];
  if (readFalKey(env)) adapters.push(createFalImageAdapter({ env, fetchImpl }));
  if (readPexelsKey(env)) adapters.push(createPexelsImageAdapter({ env, fetchImpl }));
  return createImageSourceCascade(adapters, { onWarning });
}

export function createFalImageAdapter({ env = process.env, fetchImpl = fetch } = {}) {
  return {
    provider: "fal",
    model: FAL_MODEL,
    async generateImage({ prompt, stylePreset, width, height, seed, outputPath, signal }) {
      const apiKey = readFalKey(env);
      if (!apiKey) throw new RangeError("FAL API key is not configured");
      const fullPrompt = composePrompt(prompt, stylePreset);
      const safeWidth = imageDimension(width, "width");
      const safeHeight = imageDimension(height, "height");
      const safeOutputPath = assertSafeGeneratedPath(outputPath);
      const requestBody = {
        prompt: fullPrompt,
        image_size: { width: safeWidth, height: safeHeight },
        num_images: 1
      };
      if (seed !== undefined) {
        const safeSeed = Number(seed);
        if (!Number.isSafeInteger(safeSeed) || safeSeed < 0) {
          throw new RangeError("seed must be a non-negative integer");
        }
        requestBody.seed = safeSeed;
      }

      const response = await fetchWithTimeout(fetchImpl, FAL_SYNC_URL, {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
        signal
      }, REQUEST_TIMEOUT_MS);
      if (response.status === 401 || response.status === 403) {
        throw new RangeError("FAL rejected the API key");
      }
      if (!response.ok) {
        throw new RangeError(`FAL generation failed with status ${response.status}`);
      }
      const payload = await readBoundedJson(response, MAX_RESPONSE_BYTES, "FAL response");
      const image = Array.isArray(payload?.images) ? payload.images[0] : null;
      if (!image) throw new RangeError("FAL returned no image");
      const imageUrl = typeof image.url === "string" ? image.url : "";
      if (!imageUrl.startsWith("https://")) throw new RangeError("FAL returned an unsafe image url");

      const imageResponse = await fetchWithTimeout(fetchImpl, imageUrl, { signal }, DOWNLOAD_TIMEOUT_MS);
      if (!imageResponse.ok) {
        throw new RangeError(`FAL image download failed with status ${imageResponse.status}`);
      }
      const imageBytes = await readBoundedBytes(imageResponse, MAX_IMAGE_BYTES, "FAL image");
      if (imageBytes.length === 0) {
        throw new RangeError("FAL image size is outside the allowed range");
      }
      if (!hasImageMagic(imageBytes)) {
        throw new RangeError("FAL response is not a supported image format");
      }
      await writeFile(safeOutputPath, imageBytes, { flag: "wx", mode: PRIVATE_FILE_MODE });
      await chmod(safeOutputPath, PRIVATE_FILE_MODE);
      return {
        path: safeOutputPath,
        sha256: createHash("sha256").update(imageBytes).digest("hex"),
        bytes: imageBytes.length,
        width: Number(image.width) || safeWidth,
        height: Number(image.height) || safeHeight,
        license: "fal-generated",
        provenance: {
          source: "generated",
          provider: "fal",
          model: FAL_MODEL,
          promptSha256: createHash("sha256").update(fullPrompt).digest("hex"),
          ...(requestBody.seed !== undefined ? { seed: requestBody.seed } : {})
        }
      };
    }
  };
}

const PEXELS_PHOTO_SEARCH_URL = "https://api.pexels.com/v1/search";
const MAX_KEYWORDS_CHARS = 120;

export function createPexelsImageAdapter({ env = process.env, fetchImpl = fetch } = {}) {
  return {
    provider: "pexels-photos",
    async generateImage({ prompt, width, height, outputPath, signal }) {
      const apiKey = typeof env.HERMEST_PEXELS_API_KEY === "string" ? env.HERMEST_PEXELS_API_KEY.trim() : "";
      if (!apiKey) throw new RangeError("Pexels API key is not configured");
      const keywords = String(prompt ?? "").replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").trim();
      if (!keywords) throw new RangeError("Image prompt is required");
      const safeWidth = imageDimension(width, "width");
      const safeHeight = imageDimension(height, "height");
      const safeOutputPath = assertSafeGeneratedPath(outputPath);

      const url = new URL(PEXELS_PHOTO_SEARCH_URL);
      url.searchParams.set("query", keywords.slice(0, MAX_KEYWORDS_CHARS));
      url.searchParams.set("orientation", safeHeight > safeWidth ? "portrait" : "landscape");
      url.searchParams.set("per_page", "10");
      const searchResponse = await fetchWithTimeout(fetchImpl, url.href, {
        headers: { Authorization: apiKey },
        signal
      }, REQUEST_TIMEOUT_MS);
      if (searchResponse.status === 401 || searchResponse.status === 403) {
        throw new RangeError("Pexels rejected the API key");
      }
      if (!searchResponse.ok) {
        throw new RangeError(`Pexels photo search failed with status ${searchResponse.status}`);
      }
      const payload = await readBoundedJson(searchResponse, MAX_RESPONSE_BYTES, "Pexels response");
      const photo = selectPexelsPhoto(payload, { width: safeWidth, height: safeHeight });
      if (!photo) throw new RangeError("Pexels returned no photo for the scene");
      if (!photo.fileUrl.startsWith("https://")) throw new RangeError("Pexels returned an unsafe image url");

      const imageResponse = await fetchWithTimeout(fetchImpl, photo.fileUrl, { signal }, DOWNLOAD_TIMEOUT_MS);
      if (!imageResponse.ok) {
        throw new RangeError(`Pexels photo download failed with status ${imageResponse.status}`);
      }
      const imageBytes = await readBoundedBytes(imageResponse, MAX_IMAGE_BYTES, "Pexels photo");
      if (imageBytes.length === 0 || !hasImageMagic(imageBytes)) {
        throw new RangeError("Pexels response is not a supported image format");
      }
      await writeFile(safeOutputPath, imageBytes, { flag: "wx", mode: PRIVATE_FILE_MODE });
      await chmod(safeOutputPath, PRIVATE_FILE_MODE);
      return {
        path: safeOutputPath,
        sha256: createHash("sha256").update(imageBytes).digest("hex"),
        bytes: imageBytes.length,
        width: photo.width,
        height: photo.height,
        license: "pexels",
        provenance: {
          source: "stock",
          provider: "pexels-photos",
          photoId: photo.photoId,
          author: photo.author,
          url: photo.pageUrl
        }
      };
    }
  };
}

function selectPexelsPhoto(payload, { width, height }) {
  const photos = Array.isArray(payload?.photos) ? payload.photos : [];
  const candidates = [];
  for (const photo of photos) {
    const source = photo?.src && typeof photo.src === "object" ? photo.src : {};
    const fileUrl = typeof source.original === "string" ? source.original : "";
    const photoWidth = Number(photo?.width);
    const photoHeight = Number(photo?.height);
    if (!fileUrl || !Number.isFinite(photoWidth) || !Number.isFinite(photoHeight)) continue;
    candidates.push({
      photoId: String(photo?.id ?? ""),
      author: String(photo?.photographer ?? ""),
      pageUrl: typeof photo?.url === "string" ? photo.url : "",
      fileUrl,
      width: photoWidth,
      height: photoHeight,
      // покрытие целевого кадра: фото должно закрывать обе стороны
      coverage: Math.min(photoWidth / width, photoHeight / height)
    });
  }
  candidates.sort((left, right) => right.coverage - left.coverage);
  return candidates[0] || null;
}

export function createImageSourceCascade(adapters, { onWarning } = {}) {
  const chain = (Array.isArray(adapters) ? adapters : []).filter(Boolean);
  if (chain.length === 0) throw new RangeError("Image source cascade requires at least one adapter");
  return {
    provider: chain.map(adapter => adapter.provider).join("+"),
    async generateImage(request) {
      let lastError = null;
      for (const adapter of chain) {
        try {
          return await adapter.generateImage(request);
        } catch (error) {
          lastError = error;
          onWarning?.(`image source ${adapter.provider} failed: ${error.message}`);
        }
      }
      throw lastError;
    }
  };
}

function composePrompt(prompt, stylePreset) {
  const scene = typeof prompt === "string" ? prompt.replace(/\s+/g, " ").trim() : "";
  if (!scene) throw new RangeError("Image prompt is required");
  const style = typeof stylePreset === "string" ? stylePreset.replace(/\s+/g, " ").trim() : "";
  const combined = style ? `${style}, ${scene}` : scene;
  return combined.slice(0, MAX_PROMPT_CHARS);
}

function imageDimension(value, name) {
  const dimension = Number(value);
  if (!Number.isSafeInteger(dimension) || dimension <= 0 || dimension > MAX_DIMENSION) {
    throw new RangeError(`${name} must be within 1..${MAX_DIMENSION}`);
  }
  return dimension;
}

function hasImageMagic(bytes) {
  return bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
    || bytes.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC);
}

function readFalKey(env) {
  return typeof env.HERMEST_FAL_API_KEY === "string" ? env.HERMEST_FAL_API_KEY.trim() : "";
}

function readPexelsKey(env) {
  return typeof env.HERMEST_PEXELS_API_KEY === "string" ? env.HERMEST_PEXELS_API_KEY.trim() : "";
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const upstreamSignal = options.signal;
  const onAbort = () => controller.abort();
  if (upstreamSignal) {
    if (upstreamSignal.aborted) controller.abort();
    else upstreamSignal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (upstreamSignal) upstreamSignal.removeEventListener("abort", onAbort);
  }
}

