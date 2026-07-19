import path from "node:path";

const FLITE_VOICES = new Set(["slt", "awb", "kal", "kal16", "rms"]);
const VIDEO_CODECS = new Set(["libx264"]);
const AUDIO_CODECS = new Set(["aac"]);

export function buildFliteAudioArgs({ textFile, outputFile, voice = "slt" }) {
  const safeTextFile = assertSafeGeneratedPath(textFile);
  const safeOutputFile = assertSafeGeneratedPath(outputFile);
  if (!FLITE_VOICES.has(voice)) throw new RangeError(`Unsupported flite voice: ${voice}`);
  return [
    "-hide_banner", "-loglevel", "error", "-n",
    "-f", "lavfi",
    "-i", `flite=textfile=${safeTextFile}:voice=${voice}`,
    "-ar", "48000",
    "-ac", "1",
    "-c:a", "pcm_s16le",
    safeOutputFile
  ];
}

// Every narration provider may emit its native sample rate (Piper: 22050 Hz);
// the pipeline contract for the narration artifact is fixed 48 kHz mono PCM.
export function buildNarrationCanonicalizeArgs({ inputFile, outputFile }) {
  const safeInputFile = assertSafeGeneratedPath(inputFile);
  const safeOutputFile = assertSafeGeneratedPath(outputFile);
  return [
    "-hide_banner", "-loglevel", "error", "-n",
    "-i", safeInputFile,
    "-ar", "48000",
    "-ac", "1",
    "-c:a", "pcm_s16le",
    safeOutputFile
  ];
}

export function buildVideoRenderArgs({
  audioFile,
  subtitleFile,
  outputFile,
  durationSeconds,
  sceneTitleFiles = [],
  recipe
}) {
  const safeAudioFile = assertSafeGeneratedPath(audioFile);
  const safeSubtitleFile = assertSafeGeneratedPath(subtitleFile);
  const safeOutputFile = assertSafeGeneratedPath(outputFile);
  const width = positiveInteger(recipe?.width, "width");
  const height = positiveInteger(recipe?.height, "height");
  const fps = positiveInteger(recipe?.fps, "fps");
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 21600) {
    throw new RangeError("durationSeconds must be within 0..21600");
  }
  if (!VIDEO_CODECS.has(recipe?.videoCodec)) {
    throw new RangeError(`Unsupported video codec: ${recipe?.videoCodec}`);
  }
  if (!AUDIO_CODECS.has(recipe?.audioCodec)) {
    throw new RangeError(`Unsupported audio codec: ${recipe?.audioCodec}`);
  }
  if (recipe?.pixelFormat !== "yuv420p") {
    throw new RangeError(`Unsupported pixel format: ${recipe?.pixelFormat}`);
  }
  const sampleRate = positiveInteger(recipe?.audioSampleRate, "audioSampleRate");
  const audioChannels = positiveInteger(recipe?.audioChannels, "audioChannels");
  const subtitleMargin = positiveInteger(recipe?.safeZones?.bottom, "safeZones.bottom");
  const loudnessTarget = Number(recipe?.loudnessTargetLufs);
  if (!Number.isFinite(loudnessTarget) || loudnessTarget < -70 || loudnessTarget > -5) {
    throw new RangeError("loudnessTargetLufs must be within -70..-5");
  }
  const recipeMaxDuration = Number(recipe?.maxDurationSeconds || 21600);
  if (duration > recipeMaxDuration) {
    throw new RangeError(`durationSeconds exceeds recipe maximum ${recipeMaxDuration}`);
  }
  const colorSource = `color=c=0x111827:s=${width}x${height}:r=${fps}:d=${duration.toFixed(3)}`;
  const subtitleFilter = `subtitles=filename=${safeSubtitleFile}:force_style='FontName=DejaVu Sans,Alignment=2,MarginV=${subtitleMargin}'`;
  const titleFilters = sceneTitleFiles.map((scene, index) => {
    const titlePath = assertSafeGeneratedPath(scene?.path);
    const start = Number(scene?.startSeconds);
    const end = Number(scene?.endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration + 0.001) {
      throw new RangeError(`Invalid scene title timing at index ${index}`);
    }
    const fontSize = Math.max(36, Math.round(height / 18));
    return [
      `drawtext=textfile=${titlePath}`,
      "font='DejaVu Sans'",
      "fontcolor=white",
      `fontsize=${fontSize}`,
      "x=(w-text_w)/2",
      "y=(h-text_h)/2",
      "box=1",
      "boxcolor=black@0.45",
      "boxborderw=40",
      "expansion=none",
      `enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`
    ].join(":");
  });
  const videoFilter = [...titleFilters, subtitleFilter].join(",");
  return [
    "-hide_banner", "-loglevel", "error", "-n",
    "-f", "lavfi", "-i", colorSource,
    "-i", safeAudioFile,
    "-map", "0:v:0", "-map", "1:a:0",
    "-vf", videoFilter,
    "-c:v", recipe.videoCodec,
    "-preset", "veryfast",
    "-crf", "21",
    "-pix_fmt", recipe.pixelFormat,
    "-r", String(fps),
    "-c:a", recipe.audioCodec,
    "-b:a", "192k",
    "-ar", String(sampleRate),
    "-ac", String(audioChannels),
    "-af", `loudnorm=I=${loudnessTarget}:TP=-1.5:LRA=11`,
    "-shortest",
    "-movflags", "+faststart",
    safeOutputFile
  ];
}

export function buildComposedVideoRenderArgs({
  sceneFrames,
  audioFile,
  subtitleFile,
  outputFile,
  durationSeconds,
  recipe
}) {
  if (!Array.isArray(sceneFrames) || sceneFrames.length === 0 || sceneFrames.length > 64) {
    throw new RangeError("Composed render requires 1..64 scene frames");
  }
  const safeAudioFile = assertSafeGeneratedPath(audioFile);
  const safeSubtitleFile = assertSafeGeneratedPath(subtitleFile);
  const safeOutputFile = assertSafeGeneratedPath(outputFile);
  const width = positiveInteger(recipe?.width, "width");
  const height = positiveInteger(recipe?.height, "height");
  const fps = positiveInteger(recipe?.fps, "fps");
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 21600) {
    throw new RangeError("durationSeconds must be within 0..21600");
  }
  if (!VIDEO_CODECS.has(recipe?.videoCodec)) {
    throw new RangeError(`Unsupported video codec: ${recipe?.videoCodec}`);
  }
  if (!AUDIO_CODECS.has(recipe?.audioCodec)) {
    throw new RangeError(`Unsupported audio codec: ${recipe?.audioCodec}`);
  }
  if (recipe?.pixelFormat !== "yuv420p") {
    throw new RangeError(`Unsupported pixel format: ${recipe?.pixelFormat}`);
  }
  const sampleRate = positiveInteger(recipe?.audioSampleRate, "audioSampleRate");
  const audioChannels = positiveInteger(recipe?.audioChannels, "audioChannels");
  const subtitleMargin = positiveInteger(recipe?.safeZones?.bottom, "safeZones.bottom");
  const loudnessTarget = Number(recipe?.loudnessTargetLufs);
  if (!Number.isFinite(loudnessTarget) || loudnessTarget < -70 || loudnessTarget > -5) {
    throw new RangeError("loudnessTargetLufs must be within -70..-5");
  }
  const frameInputs = [];
  const filterSegments = [];
  let inputIndex = 0;
  for (const [index, frame] of sceneFrames.entries()) {
    const framePath = assertSafeGeneratedPath(frame?.path);
    const frameDuration = Number(frame?.durationSeconds);
    if (!Number.isFinite(frameDuration) || frameDuration <= 0 || frameDuration > 3600) {
      throw new RangeError(`Invalid scene frame duration at index ${index}`);
    }
    const durationArg = frameDuration.toFixed(3);
    if (frame?.brollPath !== undefined) {
      const brollPath = assertSafeGeneratedPath(frame.brollPath);
      const brollInput = inputIndex;
      const overlayInput = inputIndex + 1;
      frameInputs.push(
        "-stream_loop", "-1",
        "-t", durationArg,
        "-i", brollPath,
        "-loop", "1",
        "-t", durationArg,
        "-framerate", String(fps),
        "-i", framePath
      );
      filterSegments.push(
        `[${brollInput}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},eq=brightness=-0.22:saturation=0.7,setsar=1[b${index}]`,
        `[${overlayInput}:v]setsar=1[f${index}]`,
        `[b${index}][f${index}]overlay=0:0,format=yuv420p[v${index}]`
      );
      inputIndex += 2;
    } else {
      frameInputs.push(
        "-loop", "1",
        "-t", durationArg,
        "-framerate", String(fps),
        "-i", framePath
      );
      filterSegments.push(
        `[${inputIndex}:v]scale=${width}:${height},setsar=1,format=yuv420p[v${index}]`
      );
      inputIndex += 1;
    }
  }
  const concatLabels = sceneFrames.map((_frame, index) => `[v${index}]`).join("");
  const subtitleFilter = `subtitles=filename=${safeSubtitleFile}:force_style='FontName=DejaVu Sans,Alignment=2,MarginV=${subtitleMargin}'`;
  const filterComplex = [
    ...filterSegments,
    `${concatLabels}concat=n=${sceneFrames.length}:v=1:a=0[vc]`,
    `[vc]${subtitleFilter}[vout]`
  ].join(";");
  return [
    "-hide_banner", "-loglevel", "error", "-n",
    ...frameInputs,
    "-i", safeAudioFile,
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-map", `${inputIndex}:a:0`,
    "-c:v", recipe.videoCodec,
    "-preset", "veryfast",
    "-crf", "21",
    "-pix_fmt", recipe.pixelFormat,
    "-r", String(fps),
    "-c:a", recipe.audioCodec,
    "-b:a", "192k",
    "-ar", String(sampleRate),
    "-ac", String(audioChannels),
    "-af", `loudnorm=I=${loudnessTarget}:TP=-1.5:LRA=11`,
    "-shortest",
    "-movflags", "+faststart",
    safeOutputFile
  ];
}

export function assertSafeGeneratedPath(value) {
  const candidate = typeof value === "string" ? value : "";
  if (!/^\/[A-Za-z0-9_./-]+$/.test(candidate) || path.posix.normalize(candidate) !== candidate) {
    throw new TypeError(`Expected a safe generated path, received: ${candidate ? "invalid" : "empty"}`);
  }
  return candidate;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return number;
}
