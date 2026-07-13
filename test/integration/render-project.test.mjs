import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { renderProject } from "../../src/media/render-project.js";

const fixture = path.resolve("test/fixtures/minimal-board.json");

for (const expected of [
  {
    platform: "youtube_video",
    recipeId: "youtube-16x9-1080p",
    width: 1920,
    height: 1080,
    repeat: true
  },
  {
    platform: "youtube_shorts",
    recipeId: "shorts-9x16-1080p",
    width: 1080,
    height: 1920,
    repeat: false
  }
]) {
  test(`renderProject creates verified ${expected.platform} MP4 with real audio`, {
    timeout: 300000
  }, async t => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), `hermest-board-${expected.platform}-root-`));
    t.after(() => rm(outputRoot, { recursive: true, force: true }));
    const result = await renderProject({
      inputPath: fixture,
      outputDir: outputRoot,
      platform: expected.platform
    });
    const diskManifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
    const video = diskManifest.artifacts.find(artifact => artifact.type === "video/mp4");
    const audio = diskManifest.artifacts.find(artifact => artifact.type === "audio/wav");
    const subtitles = diskManifest.artifacts.find(artifact => artifact.name.endsWith(".srt"));
    const storyboard = diskManifest.artifacts.find(artifact => artifact.name === "storyboard.json");

    assert.deepEqual(diskManifest, result.manifest);
    assert.equal(result.platform, expected.platform);
    assert.equal(result.recipeId, expected.recipeId);
    assert.equal(diskManifest.recipe.id, expected.recipeId);
    assert.equal(video.probe.video.codec, "h264");
    assert.equal(video.probe.audio.codec, "aac");
    assert.equal(video.probe.audio.sampleRate, 48000);
    assert.equal(video.probe.audio.channels, 2);
    assert.equal(video.probe.video.width, expected.width);
    assert.equal(video.probe.video.height, expected.height);
    assert.ok(video.probe.durationSeconds > 0);
    assert.ok(video.bytes > 0);
    assert.ok(audio.bytes > 0);
    assert.ok(subtitles.bytes > 0);
    assert.ok(storyboard.bytes > 0);

    const relativeRun = path.relative(outputRoot, result.outputDir);
    assert.notEqual(relativeRun, "");
    assert.equal(relativeRun.startsWith(".."), false);
    const runFiles = await readdir(result.outputDir);
    assert.equal(runFiles.some(name => name.endsWith(".txt") || name.includes(".partial")), false);
    assert.ok(runFiles.includes(path.basename(result.manifestHashPath)));

    for (const artifact of diskManifest.artifacts) {
      const content = await readFile(path.join(result.outputDir, artifact.name));
      assert.equal(content.byteLength, artifact.bytes);
      assert.equal(createHash("sha256").update(content).digest("hex"), artifact.sha256);
    }
    const manifestBytes = await readFile(result.manifestPath);
    const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
    const sidecar = await readFile(result.manifestHashPath, "utf8");
    assert.equal(sidecar, `${manifestSha256}  ${path.basename(result.manifestPath)}\n`);

    const srt = await readFile(result.subtitleFile, "utf8");
    assert.ok(lastSrtEndSeconds(srt) <= video.probe.durationSeconds + 0.25);

    if (expected.platform === "youtube_shorts") {
      assert.ok(diskManifest.blockers.includes("semantic_edit_not_implemented"));
      assert.equal(diskManifest.recipe.adaptationMode, "aspect_only_r1");
    }

    if (expected.repeat) {
      const secondRoot = await mkdtemp(path.join(os.tmpdir(), "hermest-board-repro-root-"));
      t.after(() => rm(secondRoot, { recursive: true, force: true }));
      const repeated = await renderProject({
        inputPath: fixture,
        outputDir: secondRoot,
        platform: expected.platform
      });
      assert.deepEqual(repeated.manifest, result.manifest);
    }
  });
}

function lastSrtEndSeconds(srt) {
  const matches = [...srt.matchAll(/-->\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})/g)];
  assert.ok(matches.length > 0, "SRT must contain at least one cue");
  const [, hours, minutes, seconds, milliseconds] = matches.at(-1);
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds) / 1000;
}
