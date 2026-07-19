import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildSceneScreenshotArgs,
  composeSceneFrames,
  describeSceneComposerAvailability
} from "../../src/media/scene-frames.js";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const storyboard = Object.freeze({
  scenes: [
    { title: "Сцена один", narration: "Текст один.", durationMs: 4200 },
    { title: "Сцена два", narration: "Текст два.", durationMs: 5100 }
  ]
});
const recipe = Object.freeze({ width: 1920, height: 1080 });

test("screenshot argv follows the exact locked schema", () => {
  const argv = buildSceneScreenshotArgs({
    profileDir: "/tmp/run/chrome-profile",
    width: 1920,
    height: 1080,
    outputFile: "/tmp/run/scene-001.png",
    inputFile: "/tmp/run/scene-001.html"
  });
  assert.deepEqual(argv, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--user-data-dir=/tmp/run/chrome-profile",
    "--window-size=1920,1080",
    "--screenshot=/tmp/run/scene-001.png",
    "file:///tmp/run/scene-001.html"
  ]);
});

test("screenshot argv rejects unsafe paths", () => {
  assert.throws(() => buildSceneScreenshotArgs({
    profileDir: "/tmp/run/../etc",
    width: 1920,
    height: 1080,
    outputFile: "/tmp/run/scene.png",
    inputFile: "/tmp/run/scene.html"
  }), TypeError);
  assert.throws(() => buildSceneScreenshotArgs({
    profileDir: "/tmp/run/profile",
    width: 1920,
    height: 1080,
    outputFile: "/tmp/run/scene with space.png",
    inputFile: "/tmp/run/scene.html"
  }), TypeError);
});

test("composer availability reports missing binary honestly", async () => {
  const availability = await describeSceneComposerAvailability({
    env: { HERMEST_CHROME_PATH: "/tmp/definitely-missing-chrome-binary" }
  });
  assert.equal(availability.status, "missing");
  assert.ok(availability.reason.includes("legacy"));
});

test("composeSceneFrames writes markup, runs chrome per scene and hashes frames", async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), "scene-frames-test-"));
  try {
    const invocations = [];
    const runner = async (tool, argv) => {
      invocations.push({ tool, argv });
      const screenshotArg = argv.find(value => value.startsWith("--screenshot="));
      await writeFile(screenshotArg.slice("--screenshot=".length), PNG_HEADER);
    };
    const result = await composeSceneFrames({
      storyboard,
      brief: { topic: "Тема", language: "ru" },
      recipe,
      runDir,
      seed: 42,
      runner
    });
    assert.equal(result.frames.length, 2);
    assert.equal(result.commands.length, 2);
    assert.equal(result.composer, "scene-markup@1");
    assert.ok(invocations.every(call => call.tool === "chrome"));
    assert.equal(result.frames[0].durationSeconds, 4.2);
    assert.match(result.frames[0].frameSha256, /^[0-9a-f]{64}$/);
    assert.match(result.frames[0].markupSha256, /^[0-9a-f]{64}$/);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("composeSceneFrames fails closed on non-png screenshot output", async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), "scene-frames-test-"));
  try {
    const runner = async (_tool, argv) => {
      const screenshotArg = argv.find(value => value.startsWith("--screenshot="));
      await writeFile(screenshotArg.slice("--screenshot=".length), "not a png");
    };
    await assert.rejects(
      composeSceneFrames({
        storyboard,
        brief: {},
        recipe,
        runDir,
        seed: 1,
        runner
      }),
      /not a valid PNG/
    );
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("composeSceneFrames validates scene count and run dir", async () => {
  await assert.rejects(
    composeSceneFrames({ storyboard: { scenes: [] }, brief: {}, recipe, runDir: "/tmp/x", seed: 1 }),
    RangeError
  );
  await assert.rejects(
    composeSceneFrames({ storyboard, brief: {}, recipe, runDir: "relative/path", seed: 1 }),
    TypeError
  );
});
