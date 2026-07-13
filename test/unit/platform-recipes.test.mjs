import assert from "node:assert/strict";
import test from "node:test";

import {
  getPlatformRecipe,
  listPlatformRecipes
} from "../../src/domain/platform-recipes.js";

test("platform recipes expose versioned real 16:9 and 9:16 render contracts", () => {
  const youtube = getPlatformRecipe("youtube_video");
  const shorts = getPlatformRecipe("youtube_shorts");
  const tiktok = getPlatformRecipe("tiktok");
  const reels = getPlatformRecipe("instagram_reels");

  assert.equal(youtube.id, "youtube-16x9-1080p");
  assert.equal(youtube.platformId, "youtube_video");
  assert.deepEqual([youtube.width, youtube.height], [1920, 1080]);
  assert.equal(youtube.segmentationStrategy, "master");
  for (const recipe of [shorts, tiktok, reels]) {
    assert.deepEqual([recipe.width, recipe.height], [1080, 1920]);
    assert.equal(recipe.adaptationMode, "aspect_only_r1");
    assert.equal(recipe.segmentationStrategy, "aspect_only_r1");
    assert.match(recipe.id, /-9x16-1080p$/);
    assert.ok(recipe.readinessBlockers.includes("semantic_edit_not_implemented"));
  }
  assert.equal(youtube.videoCodec, "libx264");
  assert.equal(youtube.audioCodec, "aac");
  assert.equal(youtube.audioChannels, 2);
  assert.equal(youtube.loudnessTargetLufs, -16);
  assert.equal(youtube.transitionPolicy, "cut_r1");
  assert.equal(youtube.subtitleLayout.mode, "burn_and_sidecar");
  assert.ok(youtube.safeZones.left >= 0);
  assert.match(youtube.version, /^1\./);
});

test("recipe lookup rejects unsupported platforms instead of guessing", () => {
  assert.throws(() => getPlatformRecipe("unknown-network"), /Unsupported platform recipe/);
});

test("recipe callers receive copies and cannot mutate the catalog", () => {
  const first = getPlatformRecipe("youtube_video");
  first.width = 1;
  const second = getPlatformRecipe("youtube_video");

  assert.equal(second.width, 1920);
  assert.deepEqual(
    listPlatformRecipes().map(recipe => recipe.platformId),
    ["youtube_video", "youtube_shorts", "tiktok", "instagram_reels"]
  );
});
