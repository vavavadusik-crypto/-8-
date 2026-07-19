import { createHash } from "node:crypto";
import { access, chmod, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";

import { assertSafeGeneratedPath } from "./ffmpeg-args.js";
import { runMediaTool } from "./process-runner.js";
import { buildSceneMarkup } from "./scene-markup.js";

const PRIVATE_FILE_MODE = 0o600;
const SCREENSHOT_TIMEOUT_MS = 60000;
const MAX_SCENES = 64;
// Окно build-in анимации сцены: дальше секвенция замирает на финальном кадре,
// а хвост сцены тянет ffmpeg (tpad clone + camera push-in).
const SCENE_BUILD_SECONDS = 2.8;
const MAX_BUILD_FRAMES = 240;

export async function describeSceneComposerAvailability({ env = process.env, accessImpl = access } = {}) {
  const binaryPath = resolveChromeBinaryPathFromEnv(env);
  try {
    await accessImpl(binaryPath, fsConstants.X_OK);
    return { status: "executable", binaryPath };
  } catch {
    return {
      status: "missing",
      binaryPath,
      reason: "Chrome binary is not executable; falling back to legacy color scenes"
    };
  }
}

function resolveChromeBinaryPathFromEnv(env) {
  const configured = typeof env.HERMEST_CHROME_PATH === "string" ? env.HERMEST_CHROME_PATH.trim() : "";
  if (configured) {
    return assertSafeGeneratedPath(configured);
  }
  return "/usr/bin/google-chrome";
}

export function buildSceneScreenshotArgs({
  profileDir,
  width,
  height,
  outputFile,
  inputFile,
  transparent = false,
  frameTimeMs
}) {
  const safeProfileDir = assertSafeGeneratedPath(profileDir);
  const safeOutputFile = assertSafeGeneratedPath(outputFile);
  const safeInputFile = assertSafeGeneratedPath(inputFile);
  const safeWidth = positiveInteger(width, "width");
  const safeHeight = positiveInteger(height, "height");
  let frameHash = "";
  if (frameTimeMs !== undefined) {
    const safeFrameTime = Number(frameTimeMs);
    if (!Number.isSafeInteger(safeFrameTime) || safeFrameTime < 0 || safeFrameTime > 600000) {
      throw new RangeError("frameTimeMs must be within 0..600000");
    }
    frameHash = `#t=${safeFrameTime}`;
  }
  return [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    ...(transparent ? ["--default-background-color=00000000"] : []),
    `--user-data-dir=${safeProfileDir}`,
    `--window-size=${safeWidth},${safeHeight}`,
    `--screenshot=${safeOutputFile}`,
    `file://${safeInputFile}${frameHash}`
  ];
}

function resolveBuildFrameLimit(env, explicitLimit) {
  if (explicitLimit !== undefined) {
    const limit = Number(explicitLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_BUILD_FRAMES) {
      throw new RangeError(`buildFrameLimit must be within 1..${MAX_BUILD_FRAMES}`);
    }
    return limit;
  }
  const configured = Number(env?.HERMEST_SCENE_BUILD_FRAME_LIMIT);
  if (Number.isSafeInteger(configured) && configured >= 1 && configured <= MAX_BUILD_FRAMES) {
    return configured;
  }
  return null;
}

export async function composeSceneFrames({
  storyboard,
  brief,
  recipe,
  runDir,
  seed,
  signal,
  brollClips = [],
  backgroundImages = [],
  buildFrameLimit,
  env = process.env,
  runner = runMediaTool
} = {}) {
  const scenes = storyboard?.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0 || scenes.length > MAX_SCENES) {
    throw new RangeError(`Scene composition requires 1..${MAX_SCENES} scenes`);
  }
  const safeRunDir = assertSafeGeneratedPath(runDir);
  const width = positiveInteger(recipe?.width, "recipe.width");
  const height = positiveInteger(recipe?.height, "recipe.height");
  const fps = positiveInteger(recipe?.fps, "recipe.fps");
  const frameLimit = resolveBuildFrameLimit(env, buildFrameLimit);
  const profileDir = path.join(safeRunDir, "chrome-profile");
  const sceneTitles = scenes.map(scene => String(scene.title || ""));
  const commands = [];
  const frames = [];

  for (const [sceneIndex, scene] of scenes.entries()) {
    const sceneTag = String(sceneIndex + 1).padStart(3, "0");
    const markupFile = path.join(safeRunDir, `scene-${sceneTag}.html`);
    const brollClip = brollClips[sceneIndex] || null;
    const backgroundImage = brollClip ? null : backgroundImages[sceneIndex] || null;
    const hasMovingBackground = Boolean(brollClip || backgroundImage);
    const markup = buildSceneMarkup({
      scene,
      sceneIndex,
      sceneTitles,
      brief,
      width,
      height,
      seed,
      mode: hasMovingBackground ? "overlay" : "opaque"
    });
    await writeFile(markupFile, markup, { encoding: "utf8", flag: "wx", mode: PRIVATE_FILE_MODE });

    const sceneSeconds = Number(scene.durationMs) / 1000;
    let frameCount = Math.min(
      Math.round(SCENE_BUILD_SECONDS * fps),
      Math.max(Math.round(sceneSeconds * fps), 1)
    );
    if (frameLimit) frameCount = Math.min(frameCount, frameLimit);

    const sceneCommands = [];
    let lastFrameFile = "";
    let lastFrameBytes = null;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const frameFile = path.join(safeRunDir, `scene-${sceneTag}-f${String(frameIndex).padStart(4, "0")}.png`);
      const command = {
        id: "scene-frame",
        tool: "chrome",
        argv: buildSceneScreenshotArgs({
          profileDir,
          width,
          height,
          outputFile: frameFile,
          inputFile: markupFile,
          transparent: hasMovingBackground,
          frameTimeMs: Math.round((frameIndex * 1000) / fps)
        })
      };
      await runner(command.tool, command.argv, { timeoutMs: SCREENSHOT_TIMEOUT_MS, signal });
      sceneCommands.push(command);
      const frameBytes = await readFile(frameFile);
      if (frameBytes.length === 0 || !isPng(frameBytes)) {
        throw new TypeError(`Scene frame ${sceneTag} is not a valid PNG screenshot`);
      }
      await chmod(frameFile, PRIVATE_FILE_MODE);
      lastFrameFile = frameFile;
      lastFrameBytes = frameBytes;
    }
    // Манифест несёт первую и последнюю команду захвата сцены; полный контент
    // секвенции зафиксирован markupSha256 + frameSha256 финального кадра.
    commands.push(sceneCommands[0]);
    if (sceneCommands.length > 1) commands.push(sceneCommands[sceneCommands.length - 1]);

    frames.push({
      path: lastFrameFile,
      sequencePattern: path.join(safeRunDir, `scene-${sceneTag}-f%04d.png`),
      sequenceFrameCount: frameCount,
      sequenceFps: fps,
      durationSeconds: sceneSeconds,
      markupSha256: createHash("sha256").update(markup).digest("hex"),
      frameSha256: createHash("sha256").update(lastFrameBytes).digest("hex"),
      ...(brollClip ? { brollPath: brollClip.path } : {}),
      ...(backgroundImage ? { backgroundImagePath: backgroundImage.path } : {})
    });
    await rm(markupFile, { force: true });
  }
  await rm(profileDir, { recursive: true, force: true });
  return { frames, commands, composer: "scene-markup@2" };
}

function isPng(bytes) {
  return bytes.length > 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return number;
}
