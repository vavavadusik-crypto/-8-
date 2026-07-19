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
const recipe = Object.freeze({ width: 1920, height: 1080, fps: 30 });

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

test("screenshot argv pins the animation frame time in the url hash", () => {
  const argv = buildSceneScreenshotArgs({
    profileDir: "/tmp/run/chrome-profile",
    width: 1920,
    height: 1080,
    outputFile: "/tmp/run/scene-001-f0007.png",
    inputFile: "/tmp/run/scene-001.html",
    frameTimeMs: 233
  });
  assert.equal(argv.at(-1), "file:///tmp/run/scene-001.html#t=233");
  assert.throws(() => buildSceneScreenshotArgs({
    profileDir: "/tmp/run/chrome-profile",
    width: 1920,
    height: 1080,
    outputFile: "/tmp/run/scene.png",
    inputFile: "/tmp/run/scene.html",
    frameTimeMs: -5
  }), RangeError);
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

test("composeSceneFrames captures an animated build-in sequence per scene", async () => {
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
      buildFrameLimit: 3,
      runner
    });
    assert.equal(result.frames.length, 2);
    assert.equal(invocations.length, 6, "3 build frames per scene");
    assert.equal(result.commands.length, 4, "first and last capture command per scene");
    assert.equal(result.composer, "scene-markup@2");
    assert.ok(invocations.every(call => call.tool === "chrome"));
    assert.ok(invocations.every(call => /#t=\d+$/.test(call.argv.at(-1))));
    assert.match(invocations[0].argv.at(-1), /#t=0$/);
    assert.match(invocations[2].argv.at(-1), /#t=67$/);

    const firstFrame = result.frames[0];
    assert.equal(firstFrame.durationSeconds, 4.2);
    assert.equal(firstFrame.sequenceFrameCount, 3);
    assert.equal(firstFrame.sequenceFps, 30);
    assert.ok(firstFrame.sequencePattern.endsWith("scene-001-f%04d.png"));
    assert.ok(firstFrame.path.endsWith("scene-001-f0002.png"), "static path is the final build frame");
    assert.match(firstFrame.frameSha256, /^[0-9a-f]{64}$/);
    assert.match(firstFrame.markupSha256, /^[0-9a-f]{64}$/);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("composeSceneFrames caps the build window by scene duration and fps", async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), "scene-frames-cap-"));
  try {
    let calls = 0;
    const runner = async (_tool, argv) => {
      calls += 1;
      const screenshotArg = argv.find(value => value.startsWith("--screenshot="));
      await writeFile(screenshotArg.slice("--screenshot=".length), PNG_HEADER);
    };
    const result = await composeSceneFrames({
      storyboard: { scenes: [{ title: "Короткая", narration: "Текст.", durationMs: 400 }] },
      brief: {},
      recipe,
      runDir,
      seed: 1,
      runner
    });
    assert.equal(result.frames[0].sequenceFrameCount, 12, "0.4s at 30fps = 12 frames");
    assert.equal(calls, 12);
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
