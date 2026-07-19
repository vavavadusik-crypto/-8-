import path from "node:path";
import {
  chmod,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";

import {
  buildNarrationScript,
  buildStoryboard,
  reconcileStoryboardDuration
} from "../domain/content-pipeline.js";
import { getPlatformRecipe } from "../domain/platform-recipes.js";
import { buildVideoRenderArgs, assertSafeGeneratedPath } from "./ffmpeg-args.js";
import { assertVideoProbe } from "./ffprobe.js";
import { buildRenderManifest, hashJson } from "./manifest.js";
import {
  describeArtifact,
  mediaToolVersion,
  probeMediaFile,
  runMediaTool
} from "./process-runner.js";
import { buildSubtitleCues, formatSrt } from "./subtitles.js";
import { selectNarrationAdapter } from "./narration.js";
import { validateJsonStructure } from "./structural-preflight.js";

const MAX_BOARD_INPUT_BYTES = 2 * 1024 * 1024;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;

export async function renderProject({
  inputPath,
  project: projectInput,
  outputDir,
  platform = "youtube_video",
  ttsAdapter = null,
  signal
}) {
  signal?.throwIfAborted();
  const project = projectInput === undefined
    ? await preflightBoardInput(inputPath)
    : validateBoardProject(projectInput);
  const estimatedStoryboard = buildStoryboard(project);
  const narration = buildNarrationScript(estimatedStoryboard);
  const recipe = getPlatformRecipe(platform);
  const outputRoot = await resolveOutputRoot(outputDir);
  const runDir = assertSafeGeneratedPath(await mkdtemp(path.join(outputRoot, `${recipe.platformId}-`)));
  await chmod(runDir, PRIVATE_DIRECTORY_MODE);
  let completed = false;

  try {
    const narrationPartial = path.join(runDir, "narration.partial.wav");
    const narrationAudioFile = path.join(runDir, "narration.wav");
    const narrationLanguage = project?.brief?.language || "en";
    const narrationVoice = typeof project?.brief?.voice === "string" && project.brief.voice
      ? project.brief.voice
      : undefined;
    const narrationAdapter = ttsAdapter || await selectNarrationAdapter({
      language: narrationLanguage,
      voice: narrationVoice,
      provider: project?.brief?.narrationProvider
    });
    const tts = await narrationAdapter.synthesize({
      text: narration,
      language: narrationLanguage,
      voice: narrationVoice,
      outputPath: narrationPartial,
      signal
    });
    const narrationProbe = await probeMediaFile(narrationPartial, { signal });
    if (!narrationProbe.audio) throw new TypeError("Narration output does not contain an audio stream");
    await chmod(narrationPartial, PRIVATE_FILE_MODE);
    await rename(narrationPartial, narrationAudioFile);

    const storyboard = reconcileStoryboardDuration(
      estimatedStoryboard,
      Math.round(narrationProbe.durationSeconds * 1000)
    );
    const storyboardFile = path.join(runDir, "storyboard.json");
    const subtitleFile = path.join(runDir, "narration.srt");
    await atomicWriteFile(storyboardFile, `${JSON.stringify(storyboard, null, 2)}\n`);
    await atomicWriteFile(subtitleFile, formatSrt(buildSubtitleCues(storyboard)));

    let sceneCursorMs = 0;
    const sceneTitleFiles = [];
    for (const [index, scene] of storyboard.scenes.entries()) {
      const titleFile = path.join(runDir, `scene-${String(index + 1).padStart(3, "0")}.txt`);
      await writeFile(titleFile, `${scene.title}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: PRIVATE_FILE_MODE
      });
      sceneTitleFiles.push({
        path: titleFile,
        startSeconds: sceneCursorMs / 1000,
        endSeconds: (sceneCursorMs + scene.durationMs) / 1000
      });
      sceneCursorMs += scene.durationMs;
    }

    const videoName = `${recipe.id}.mp4`;
    const videoPartial = path.join(runDir, `${recipe.id}.partial.mp4`);
    const videoFile = path.join(runDir, videoName);
    const renderCommand = {
      id: "render",
      tool: "ffmpeg",
      argv: buildVideoRenderArgs({
        audioFile: narrationAudioFile,
        subtitleFile,
        outputFile: videoPartial,
        durationSeconds: narrationProbe.durationSeconds,
        sceneTitleFiles,
        recipe
      })
    };
    try {
      await runMediaTool(renderCommand.tool, renderCommand.argv, {
        timeoutMs: 300000,
        signal
      });
    } finally {
      await Promise.all(sceneTitleFiles.map(scene => rm(scene.path, { force: true })));
    }
    const videoProbe = assertVideoProbe(
      await probeMediaFile(videoPartial, { signal }),
      recipe,
      { expectedDurationSeconds: narrationProbe.durationSeconds }
    );
    await chmod(videoPartial, PRIVATE_FILE_MODE);
    await rename(videoPartial, videoFile);

    const artifacts = await Promise.all([
      describeArtifact(storyboardFile, {
        name: "storyboard.json",
        type: "application/json",
        probe: { schemaVersion: storyboard.schemaVersion, scenes: storyboard.scenes.length }
      }),
      describeArtifact(narrationAudioFile, {
        name: "narration.wav",
        type: "audio/wav",
        probe: narrationProbe
      }),
      describeArtifact(subtitleFile, {
        name: "narration.srt",
        type: "application/x-subrip",
        probe: { durationSeconds: narrationProbe.durationSeconds }
      }),
      describeArtifact(videoFile, {
        name: videoName,
        type: "video/mp4",
        probe: videoProbe
      })
    ]);

    const commands = [tts.command, renderCommand].filter(Boolean);
    const manifest = buildRenderManifest({
      project,
      storyboard,
      recipe,
      tools: {
        ffmpeg: await mediaToolVersion("ffmpeg", { signal }),
        ffprobe: await mediaToolVersion("ffprobe", { signal }),
        renderer: "hermest-board-media-r1",
        tts
      },
      commands,
      qc: {
        passed: true,
        checks: [
          "input_preflight",
          "storyboard_schema",
          "narration_audio_probe",
          "subtitle_timeline",
          "video_streams_codecs_dimensions_duration",
          "artifact_hashes"
        ]
      },
      blockers: recipe.readinessBlockers,
      warnings: tts.warnings,
      lineage: {
        parents: [`project:${project.projectId || hashJson(project)}`],
        children: artifacts.map(artifact => `artifact:${artifact.sha256}`)
      },
      artifacts
    });
    const manifestName = `${recipe.id}.manifest.json`;
    const manifestPath = path.join(runDir, manifestName);
    await atomicWriteFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const manifestArtifact = await describeArtifact(manifestPath, {
      name: manifestName,
      type: "application/json",
      probe: { schemaVersion: manifest.schemaVersion }
    });
    const manifestHashPath = path.join(runDir, `${manifestName}.sha256`);
    await atomicWriteFile(
      manifestHashPath,
      `${manifestArtifact.sha256}  ${manifestName}\n`
    );

    completed = true;
    return {
      outputDir: runDir,
      platform: recipe.platformId,
      recipeId: recipe.id,
      manifestPath,
      manifestHashPath,
      manifestArtifact,
      videoFile,
      subtitleFile,
      narrationAudioFile,
      storyboardFile,
      manifest
    };
  } finally {
    if (!completed) await rm(runDir, { recursive: true, force: true });
  }
}

export async function preflightBoardInput(inputPath) {
  const resolvedInput = path.resolve(inputPath);
  const info = await stat(resolvedInput);
  if (!info.isFile()) throw new TypeError("Board input must be a regular file");
  if (info.size <= 0 || info.size > MAX_BOARD_INPUT_BYTES) {
    throw new RangeError(`Board input file exceeds the ${MAX_BOARD_INPUT_BYTES} byte limit`);
  }
  const raw = await readFile(resolvedInput, "utf8");
  let project;
  try {
    project = JSON.parse(raw);
  } catch {
    throw new TypeError("Board input must contain valid JSON");
  }
  return validateBoardProject(project);
}

export function validateBoardProject(project) {
  validateJsonStructure(project);
  buildStoryboard(project);
  hashJson(project);
  return project;
}

export async function resolveOutputRoot(outputDir) {
  const requested = path.resolve(outputDir);
  const resolved = assertSafeGeneratedPath(await realpath(requested));
  const info = await stat(resolved);
  if (!info.isDirectory()) throw new TypeError("Render output root must be an existing directory");
  const configuredRoots = await resolveAllowedRoots();
  return assertAllowedOutputDirectory(resolved, configuredRoots);
}

async function resolveAllowedRoots() {
  return [await realpath("/tmp")];
}

async function atomicWriteFile(filePath, content) {
  const finalPath = assertSafeGeneratedPath(filePath);
  const partialPath = assertSafeGeneratedPath(`${filePath}.partial`);
  await writeFile(partialPath, content, {
    encoding: "utf8",
    flag: "wx",
    mode: PRIVATE_FILE_MODE
  });
  await rename(partialPath, finalPath);
  return finalPath;
}

export function assertAllowedOutputDirectory(outputDir, allowedRoots) {
  const candidate = assertSafeGeneratedPath(path.resolve(outputDir));
  for (const configuredRoot of allowedRoots) {
    const root = path.resolve(configuredRoot);
    const relative = path.relative(root, candidate);
    if (relative === "") return candidate;
    if (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) {
      return candidate;
    }
  }
  throw new TypeError("Render output is outside allowed render roots");
}

export async function assertEmptyOutputDirectory(outputDir) {
  const entries = await readdir(outputDir);
  if (entries.length > 0) throw new TypeError("Render output directory must be empty");
  return outputDir;
}
