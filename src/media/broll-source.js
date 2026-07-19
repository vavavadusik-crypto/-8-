import { createHash } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertSafeGeneratedPath } from "./ffmpeg-args.js";

const PRIVATE_FILE_MODE = 0o600;
const PEXELS_SEARCH_URL = "https://api.pexels.com/videos/search";
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_CLIP_BYTES = 80 * 1024 * 1024;
const MAX_KEYWORDS_CHARS = 120;
const REQUEST_TIMEOUT_MS = 30000;
const DOWNLOAD_TIMEOUT_MS = 120000;

export function describeBrollAvailability({ env = process.env } = {}) {
  const key = readPexelsKey(env);
  if (!key) {
    return {
      status: "missing",
      provider: "pexels",
      reason: "Pexels API key is not configured; scenes render without b-roll footage"
    };
  }
  return { status: "executable", provider: "pexels" };
}

export function createPexelsBrollAdapter({ env = process.env, fetchImpl = fetch } = {}) {
  return {
    provider: "pexels",
    async fetchClip({ keywords, orientation, minDurationSeconds, outputPath, signal }) {
      const apiKey = readPexelsKey(env);
      if (!apiKey) throw new RangeError("Pexels API key is not configured");
      const query = normalizeKeywords(keywords);
      const safeOrientation = orientation === "portrait" ? "portrait" : "landscape";
      const minDuration = Number(minDurationSeconds);
      if (!Number.isFinite(minDuration) || minDuration <= 0 || minDuration > 3600) {
        throw new RangeError("minDurationSeconds must be within 0..3600");
      }
      const safeOutputPath = assertSafeGeneratedPath(outputPath);

      const url = new URL(PEXELS_SEARCH_URL);
      url.searchParams.set("query", query);
      url.searchParams.set("orientation", safeOrientation);
      url.searchParams.set("per_page", "10");
      const searchResponse = await fetchWithTimeout(fetchImpl, url.href, {
        headers: { Authorization: apiKey },
        signal
      }, REQUEST_TIMEOUT_MS);
      if (searchResponse.status === 401 || searchResponse.status === 403) {
        throw new RangeError("Pexels rejected the API key");
      }
      if (!searchResponse.ok) {
        throw new RangeError(`Pexels search failed with status ${searchResponse.status}`);
      }
      const body = await readBoundedText(searchResponse, MAX_RESPONSE_BYTES);
      const selected = selectPexelsClip(parseJson(body), {
        orientation: safeOrientation,
        minDurationSeconds: minDuration
      });
      if (!selected) return null;

      const clipResponse = await fetchWithTimeout(fetchImpl, selected.fileUrl, { signal }, DOWNLOAD_TIMEOUT_MS);
      if (!clipResponse.ok) {
        throw new RangeError(`Pexels clip download failed with status ${clipResponse.status}`);
      }
      const clipBytes = Buffer.from(await clipResponse.arrayBuffer());
      if (clipBytes.length === 0 || clipBytes.length > MAX_CLIP_BYTES) {
        throw new RangeError("Pexels clip size is outside the allowed range");
      }
      await writeFile(safeOutputPath, clipBytes, { flag: "wx", mode: PRIVATE_FILE_MODE });
      await chmod(safeOutputPath, PRIVATE_FILE_MODE);
      return {
        path: safeOutputPath,
        sha256: createHash("sha256").update(clipBytes).digest("hex"),
        bytes: clipBytes.length,
        durationSeconds: selected.durationSeconds,
        license: "pexels",
        provenance: {
          source: "stock",
          provider: "pexels",
          clipId: selected.clipId,
          author: selected.author,
          url: selected.pageUrl
        }
      };
    }
  };
}

export function selectPexelsClip(payload, { orientation, minDurationSeconds }) {
  const videos = Array.isArray(payload?.videos) ? payload.videos : [];
  const wantPortrait = orientation === "portrait";
  const candidates = [];
  for (const video of videos) {
    const durationSeconds = Number(video?.duration);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) continue;
    const files = Array.isArray(video?.video_files) ? video.video_files : [];
    for (const file of files) {
      const width = Number(file?.width);
      const height = Number(file?.height);
      const link = typeof file?.link === "string" ? file.link : "";
      if (!link.startsWith("https://") || !Number.isFinite(width) || !Number.isFinite(height)) continue;
      const isPortrait = height > width;
      if (isPortrait !== wantPortrait) continue;
      const coverage = Math.min(width, height);
      candidates.push({
        clipId: String(video?.id ?? ""),
        author: String(video?.user?.name ?? ""),
        pageUrl: typeof video?.url === "string" ? video.url : "",
        fileUrl: link,
        durationSeconds,
        coverage,
        longEnough: durationSeconds >= minDurationSeconds
      });
    }
  }
  candidates.sort((left, right) => {
    if (left.longEnough !== right.longEnough) return left.longEnough ? -1 : 1;
    return right.coverage - left.coverage;
  });
  return candidates[0] || null;
}

function normalizeKeywords(keywords) {
  const text = Array.isArray(keywords) ? keywords.join(" ") : String(keywords ?? "");
  const cleaned = text.replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) throw new RangeError("B-roll keywords are required");
  return cleaned.slice(0, MAX_KEYWORDS_CHARS);
}

function readPexelsKey(env) {
  const key = typeof env.HERMEST_PEXELS_API_KEY === "string" ? env.HERMEST_PEXELS_API_KEY.trim() : "";
  return key;
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

async function readBoundedText(response, limit) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > limit) {
    throw new RangeError("Pexels response exceeds the allowed size");
  }
  return text;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new RangeError("Pexels response is not valid JSON");
  }
}
