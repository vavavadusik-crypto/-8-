import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertSafeGeneratedPath } from "./ffmpeg-args.js";

const DEFAULT_LIBRARY_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "assets",
  "music"
);
const TRACK_FILE_PATTERN = /^[a-z0-9][a-z0-9-]*\.(?:m4a|mp3|wav|ogg|flac)$/;
const TRACK_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const MAX_TRACKS = 64;
const MAX_TRACK_BYTES = 32 * 1024 * 1024;

export async function loadMusicLibrary({ libraryDir = DEFAULT_LIBRARY_DIR } = {}) {
  const manifestPath = path.join(libraryDir, "library.json");
  let rawManifest;
  try {
    rawManifest = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(rawManifest);
  } catch {
    throw new TypeError("Music library manifest is not valid JSON");
  }
  const entries = Array.isArray(parsed?.tracks) ? parsed.tracks : null;
  if (!entries) throw new TypeError("Music library manifest must contain a tracks array");
  if (entries.length > MAX_TRACKS) throw new TypeError("Music library exceeds the allowed track count");

  const tracks = [];
  const seenIds = new Set();
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`Invalid music track record at index ${index}`);
    }
    const id = typeof entry.id === "string" ? entry.id : "";
    if (!TRACK_ID_PATTERN.test(id)) throw new TypeError(`Invalid music track id at index ${index}`);
    if (seenIds.has(id)) throw new TypeError(`Duplicate music track id: ${id}`);
    seenIds.add(id);
    const fileName = typeof entry.file === "string" ? entry.file : "";
    if (!TRACK_FILE_PATTERN.test(fileName)) {
      throw new TypeError(`Invalid music track file name at index ${index}`);
    }
    const license = typeof entry.license === "string" ? entry.license.trim() : "";
    if (!license) throw new TypeError(`Music track without a license record at index ${index}`);
    const trackPath = assertSafeGeneratedPath(path.join(libraryDir, fileName));
    const bytes = await readFile(trackPath);
    if (bytes.length === 0 || bytes.length > MAX_TRACK_BYTES) {
      throw new TypeError(`Music track file size is outside the allowed range: ${fileName}`);
    }
    tracks.push({
      id,
      path: trackPath,
      title: typeof entry.title === "string" ? entry.title.trim() : "",
      mood: typeof entry.mood === "string" ? entry.mood.trim().toLowerCase() : "",
      license,
      source: typeof entry.source === "string" ? entry.source.trim() : "",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  }
  tracks.sort((left, right) => left.id.localeCompare(right.id));
  return tracks;
}

export function selectMusicTrack(tracks, { mood } = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  const wantedMood = typeof mood === "string" ? mood.trim().toLowerCase() : "";
  const pool = wantedMood ? tracks.filter(track => track.mood === wantedMood) : tracks;
  return pool[0] || null;
}
