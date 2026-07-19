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

export function buildSceneScreenshotArgs({ profileDir, width, height, outputFile, inputFile }) {
  const safeProfileDir = assertSafeGeneratedPath(profileDir);
  const safeOutputFile = assertSafeGeneratedPath(outputFile);
  const safeInputFile = assertSafeGeneratedPath(inputFile);
  const safeWidth = positiveInteger(width, "width");
  const safeHeight = positiveInteger(height, "height");
  return [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--user-data-dir=${safeProfileDir}`,
    `--window-size=${safeWidth},${safeHeight}`,
    `--screenshot=${safeOutputFile}`,
    `file://${safeInputFile}`
  ];
}

export async function composeSceneFrames({
  storyboard,
  brief,
  recipe,
  runDir,
  seed,
  signal,
  runner = runMediaTool
} = {}) {
  const scenes = storyboard?.scenes;
  if (!Array.isArray(scenes) || scenes.length === 0 || scenes.length > MAX_SCENES) {
    throw new RangeError(`Scene composition requires 1..${MAX_SCENES} scenes`);
  }
  const safeRunDir = assertSafeGeneratedPath(runDir);
  const width = positiveInteger(recipe?.width, "recipe.width");
  const height = positiveInteger(recipe?.height, "recipe.height");
  const profileDir = path.join(safeRunDir, "chrome-profile");
  const sceneTitles = scenes.map(scene => String(scene.title || ""));
  const commands = [];
  const frames = [];

  for (const [sceneIndex, scene] of scenes.entries()) {
    const sceneTag = String(sceneIndex + 1).padStart(3, "0");
    const markupFile = path.join(safeRunDir, `scene-${sceneTag}.html`);
    const frameFile = path.join(safeRunDir, `scene-${sceneTag}.png`);
    const markup = buildSceneMarkup({
      scene,
      sceneIndex,
      sceneTitles,
      brief,
      width,
      height,
      seed
    });
    await writeFile(markupFile, markup, { encoding: "utf8", flag: "wx", mode: PRIVATE_FILE_MODE });
    const command = {
      id: "scene-frame",
      tool: "chrome",
      argv: buildSceneScreenshotArgs({
        profileDir,
        width,
        height,
        outputFile: frameFile,
        inputFile: markupFile
      })
    };
    await runner(command.tool, command.argv, { timeoutMs: SCREENSHOT_TIMEOUT_MS, signal });
    commands.push(command);
    const frameBytes = await readFile(frameFile);
    if (frameBytes.length === 0 || !isPng(frameBytes)) {
      throw new TypeError(`Scene frame ${sceneTag} is not a valid PNG screenshot`);
    }
    await chmod(frameFile, PRIVATE_FILE_MODE);
    frames.push({
      path: frameFile,
      durationSeconds: Number(scene.durationMs) / 1000,
      markupSha256: createHash("sha256").update(markup).digest("hex"),
      frameSha256: createHash("sha256").update(frameBytes).digest("hex")
    });
    await rm(markupFile, { force: true });
  }
  await rm(profileDir, { recursive: true, force: true });
  return { frames, commands, composer: "scene-markup@1" };
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
