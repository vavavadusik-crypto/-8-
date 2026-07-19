import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadMusicLibrary, selectMusicTrack } from "../../src/media/music-library.js";

async function withLibrary(manifest, files, run) {
  const libraryDir = await mkdtemp(path.join(tmpdir(), "music-lib-"));
  try {
    if (manifest !== null) {
      await writeFile(path.join(libraryDir, "library.json"), JSON.stringify(manifest));
    }
    for (const [name, content] of Object.entries(files)) {
      await writeFile(path.join(libraryDir, name), content);
    }
    return await run(libraryDir);
  } finally {
    await rm(libraryDir, { recursive: true, force: true });
  }
}

const validManifest = {
  schemaVersion: "music-library-v1",
  tracks: [
    {
      id: "warm-drift",
      file: "warm-drift.m4a",
      title: "Warm Drift",
      mood: "warm",
      license: "CC0",
      source: "procedural ffmpeg synthesis"
    },
    {
      id: "calm-ambient-pad",
      file: "calm-ambient-pad.m4a",
      title: "Calm Ambient Pad",
      mood: "calm",
      license: "CC0",
      source: "procedural ffmpeg synthesis"
    }
  ]
};

const validFiles = {
  "warm-drift.m4a": Buffer.from("warm-bytes"),
  "calm-ambient-pad.m4a": Buffer.from("calm-bytes")
};

test("loadMusicLibrary returns verified tracks sorted by id", async () => {
  const tracks = await withLibrary(validManifest, validFiles, libraryDir => loadMusicLibrary({ libraryDir }));
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks.map(track => track.id), ["calm-ambient-pad", "warm-drift"]);
  assert.match(tracks[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(tracks[0].license, "CC0");
  assert.ok(tracks[0].path.endsWith("/calm-ambient-pad.m4a"));
});

test("loadMusicLibrary returns empty list when the library is absent", async () => {
  const tracks = await withLibrary(null, {}, libraryDir => loadMusicLibrary({ libraryDir }));
  assert.deepEqual(tracks, []);
});

test("loadMusicLibrary fails closed on a track without a license", async () => {
  const manifest = structuredClone(validManifest);
  manifest.tracks[0].license = "";
  await assert.rejects(
    withLibrary(manifest, validFiles, libraryDir => loadMusicLibrary({ libraryDir })),
    /license/
  );
});

test("loadMusicLibrary rejects unsafe track file names", async () => {
  const manifest = structuredClone(validManifest);
  manifest.tracks[0].file = "../escape.m4a";
  await assert.rejects(
    withLibrary(manifest, validFiles, libraryDir => loadMusicLibrary({ libraryDir })),
    /file/
  );
});

test("loadMusicLibrary fails closed on a missing track file", async () => {
  const files = { "calm-ambient-pad.m4a": Buffer.from("calm-bytes") };
  await assert.rejects(
    withLibrary(validManifest, files, libraryDir => loadMusicLibrary({ libraryDir }))
  );
});

test("selectMusicTrack picks deterministically by mood with honest misses", async () => {
  const tracks = await withLibrary(validManifest, validFiles, libraryDir => loadMusicLibrary({ libraryDir }));
  assert.equal(selectMusicTrack(tracks, {}).id, "calm-ambient-pad");
  assert.equal(selectMusicTrack(tracks, { mood: "warm" }).id, "warm-drift");
  assert.equal(selectMusicTrack(tracks, { mood: "epic" }), null);
  assert.equal(selectMusicTrack([], {}), null);
});
