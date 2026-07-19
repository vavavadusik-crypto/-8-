import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { renderProject } from "../../src/media/render-project.js";

const execFileAsync = promisify(execFile);

const enFixture = path.resolve("test/fixtures/minimal-board.json");
const ruFixture = path.resolve("test/fixtures/russian-board.json");

for (const expected of [
  {
    label: "english youtube_video",
    fixture: enFixture,
    platform: "youtube_video",
    recipeId: "youtube-16x9-1080p",
    width: 1920,
    height: 1080,
    repeat: true,
    narration: { provider: "piper", language: "en", voice: "en_US-lessac-medium" }
  },
  {
    label: "english youtube_shorts",
    fixture: enFixture,
    platform: "youtube_shorts",
    recipeId: "shorts-9x16-1080p",
    width: 1080,
    height: 1920,
    repeat: true,
    narration: { provider: "piper", language: "en", voice: "en_US-lessac-medium" }
  },
  {
    label: "russian youtube_video",
    fixture: ruFixture,
    platform: "youtube_video",
    recipeId: "youtube-16x9-1080p",
    width: 1920,
    height: 1080,
    repeat: false,
    narration: { provider: "piper", language: "ru", voice: "ru_RU-dmitri-medium" }
  }
]) {
  test(`renderProject creates verified ${expected.label} MP4 with real audio`, {
    timeout: 300000
  }, async t => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), `hermest-board-${expected.platform}-root-`));
    t.after(() => rm(outputRoot, { recursive: true, force: true }));
    const result = await renderProject({
      inputPath: expected.fixture,
      outputDir: outputRoot,
      platform: expected.platform
    });
    const independent = await independentlyProbeArtifacts(result, expected);
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
    assert.equal(diskManifest.tools.tts.provider, expected.narration.provider);
    assert.equal(diskManifest.tools.tts.language, expected.narration.language);
    assert.equal(diskManifest.tools.tts.voice, expected.narration.voice);
    assert.ok(diskManifest.qc.checks.includes("audio_loudness_measured"));
    assert.ok(Number.isFinite(diskManifest.qc.loudness.integratedLufs));
    assert.ok(Number.isFinite(diskManifest.qc.loudness.truePeakDbtp));
    assert.equal(diskManifest.qc.loudness.targetIntegratedLufs, -16);
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
    assert.ok(lastSrtEndSeconds(srt) <= independent.videoDurationSeconds + 0.25);

    if (expected.platform === "youtube_shorts") {
      assert.ok(diskManifest.blockers.includes("semantic_edit_not_implemented"));
      assert.equal(diskManifest.recipe.adaptationMode, "aspect_only_r1");
    }

    if (expected.repeat) {
      const secondRoot = await mkdtemp(path.join(os.tmpdir(), "hermest-board-repro-root-"));
      t.after(() => rm(secondRoot, { recursive: true, force: true }));
      const repeated = await renderProject({
        inputPath: expected.fixture,
        outputDir: secondRoot,
        platform: expected.platform
      });
      await independentlyProbeArtifacts(repeated, expected);
      assert.deepEqual(repeated.manifest, result.manifest);
    }
  });
}

async function independentlyProbeArtifacts(result, expected) {
  const videoProbe = await independentFfprobe(result.videoFile);
  const narrationProbe = await independentFfprobe(result.narrationAudioFile);
  const videoStream = videoProbe.streams.find(stream => stream.codec_type === "video");
  const renderedAudioStream = videoProbe.streams.find(stream => stream.codec_type === "audio");
  const narrationStream = narrationProbe.streams.find(stream => stream.codec_type === "audio");

  assert.ok(videoStream, "independent ffprobe must find a video stream");
  assert.ok(renderedAudioStream, "independent ffprobe must find an audio stream in MP4");
  assert.ok(narrationStream, "independent ffprobe must find narration audio");
  assert.equal(videoStream.codec_name, "h264");
  assert.equal(Number(videoStream.width), expected.width);
  assert.equal(Number(videoStream.height), expected.height);
  assert.equal(renderedAudioStream.codec_name, "aac");
  assert.equal(Number(renderedAudioStream.sample_rate), 48000);
  assert.equal(Number(renderedAudioStream.channels), 2);
  assert.equal(narrationStream.codec_name, "pcm_s16le");
  assert.equal(Number(narrationStream.sample_rate), 48000);
  assert.equal(Number(narrationStream.channels), 1);

  const videoDurationSeconds = Number(videoProbe.format.duration);
  const narrationDurationSeconds = Number(narrationProbe.format.duration);
  assert.ok(Number(videoProbe.format.size) > 0);
  assert.ok(Number(narrationProbe.format.size) > 0);
  assert.ok(videoDurationSeconds > 0);
  assert.ok(narrationDurationSeconds > 0);
  assert.ok(Math.abs(videoDurationSeconds - narrationDurationSeconds) <= 0.25);
  return { videoDurationSeconds, narrationDurationSeconds };
}

async function independentFfprobe(filePath) {
  const { stdout } = await execFileAsync("/usr/bin/ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,sample_rate,channels",
    "-of", "json",
    filePath
  ], {
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" }
  });
  return JSON.parse(stdout);
}

function lastSrtEndSeconds(srt) {
  const matches = [...srt.matchAll(/-->\s+(\d{2}):(\d{2}):(\d{2}),(\d{3})/g)];
  assert.ok(matches.length > 0, "SRT must contain at least one cue");
  const [, hours, minutes, seconds, milliseconds] = matches.at(-1);
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds) / 1000;
}

test("music bed is ducked under narration by sidechaincompress", {
  timeout: 300000
}, async t => {
  const { buildComposedVideoRenderArgs } = await import("../../src/media/ffmpeg-args.js");
  const runDir = await mkdtemp(path.join(os.tmpdir(), "hermest-ducking-"));
  t.after(() => rm(runDir, { recursive: true, force: true }));
  const ffmpegEnv = { timeout: 120000, maxBuffer: 4 * 1024 * 1024, env: { PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" } };
  const framePath = path.join(runDir, "frame.png");
  const narrationPath = path.join(runDir, "narration.wav");
  const musicPath = path.join(runDir, "music.m4a");
  const subtitlePath = path.join(runDir, "narration.srt");
  const outputPath = path.join(runDir, "out.mp4");
  await execFileAsync("/usr/bin/ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=320x180", "-frames:v", "1", framePath
  ], ffmpegEnv);
  // Голос: тон 220 Гц первые 3 с, затем тишина — окно для замера неприглушённой музыки.
  await execFileAsync("/usr/bin/ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "aevalsrc=if(lt(t\\,3)\\,0.6*sin(2*PI*220*t)\\,0):s=48000:d=6",
    "-af", "aformat=channel_layouts=stereo", narrationPath
  ], ffmpegEnv);
  // Музыка: тон 2 кГц — отделяется от голоса highpass-фильтром при замере.
  // lavfi sine генерирует ~-18 dBFS, поэтому усиливаем до уровня реального трека.
  await execFileAsync("/usr/bin/ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=frequency=2000:duration=6",
    "-af", "volume=2.5,aformat=channel_layouts=stereo",
    "-c:a", "aac", musicPath
  ], ffmpegEnv);
  const { writeFile: writeFileAsync } = await import("node:fs/promises");
  await writeFileAsync(subtitlePath, "1\n00:00:00,000 --> 00:00:05,000\nducking test\n");
  const args = buildComposedVideoRenderArgs({
    sceneFrames: [{ path: framePath, durationSeconds: 6 }],
    audioFile: narrationPath,
    subtitleFile: subtitlePath,
    outputFile: outputPath,
    durationSeconds: 6,
    recipe: {
      width: 320,
      height: 180,
      fps: 30,
      videoCodec: "libx264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      audioSampleRate: 48000,
      audioChannels: 2,
      safeZones: { bottom: 32 },
      loudnessTargetLufs: -16
    },
    music: { path: musicPath }
  });
  await execFileAsync("/usr/bin/ffmpeg", args, ffmpegEnv);
  const measureMusicRms = async (startSeconds, endSeconds) => {
    const { stderr } = await execFileAsync("/usr/bin/ffmpeg", [
      "-hide_banner", "-i", outputPath,
      "-map", "0:a:0",
      "-af", `atrim=start=${startSeconds}:end=${endSeconds},asetpts=PTS-STARTPTS,highpass=f=1200,highpass=f=1200,astats=metadata=0`,
      "-f", "null", "-"
    ], ffmpegEnv);
    const matches = [...stderr.matchAll(/RMS level dB:\s*(-?[\d.]+)/g)];
    assert.ok(matches.length > 0, "astats must report RMS level");
    return Number(matches.at(-1)[1]);
  };
  const duckedRms = await measureMusicRms(0.8, 2.6);
  const openRms = await measureMusicRms(4.2, 5.6);
  assert.ok(openRms > -45, `music bed must be audible during silence, got ${openRms} dBFS`);
  assert.ok(
    openRms - duckedRms >= 6,
    `music must be ducked under narration by >=6 dB (open ${openRms}, ducked ${duckedRms})`
  );
});
