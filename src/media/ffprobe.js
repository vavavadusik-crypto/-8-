export function parseProbeOutput(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TypeError("ffprobe output must be valid JSON");
  }
  const durationSeconds = Number(parsed?.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new TypeError("ffprobe output requires a positive duration");
  }
  const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
  const videoStream = streams.find(stream => stream?.codec_type === "video");
  const audioStream = streams.find(stream => stream?.codec_type === "audio");
  return {
    durationSeconds,
    bytes: positiveNumberOrZero(parsed?.format?.size),
    video: videoStream ? {
      codec: String(videoStream.codec_name || "unknown"),
      width: positiveNumberOrZero(videoStream.width),
      height: positiveNumberOrZero(videoStream.height)
    } : null,
    audio: audioStream ? {
      codec: String(audioStream.codec_name || "unknown"),
      sampleRate: positiveNumberOrZero(audioStream.sample_rate),
      channels: positiveNumberOrZero(audioStream.channels)
    } : null
  };
}

export function assertVideoProbe(probe, recipe, {
  expectedDurationSeconds,
  durationToleranceSeconds = 0.25
} = {}) {
  if (!probe?.video) throw new TypeError("Rendered artifact requires a video stream");
  if (!probe?.audio) throw new TypeError("Rendered artifact requires an audio stream");
  if (probe.video.width !== Number(recipe?.width) || probe.video.height !== Number(recipe?.height)) {
    throw new TypeError(
      `Rendered video dimensions ${probe.video.width}x${probe.video.height} do not match recipe`
    );
  }
  const expectedVideoCodec = recipe?.videoCodec === "libx264" ? "h264" : String(recipe?.videoCodec || "");
  if (!expectedVideoCodec || probe.video.codec !== expectedVideoCodec) {
    throw new TypeError(`Rendered video codec ${probe.video.codec} does not match recipe ${expectedVideoCodec}`);
  }
  const expectedAudioCodec = String(recipe?.audioCodec || "");
  if (!expectedAudioCodec || probe.audio.codec !== expectedAudioCodec) {
    throw new TypeError(`Rendered audio codec ${probe.audio.codec} does not match recipe ${expectedAudioCodec}`);
  }
  if (probe.audio.sampleRate !== Number(recipe?.audioSampleRate)) {
    throw new TypeError(`Rendered audio sample rate ${probe.audio.sampleRate} does not match recipe`);
  }
  if (probe.audio.channels !== Number(recipe?.audioChannels)) {
    throw new TypeError(`Rendered audio channels ${probe.audio.channels} do not match recipe`);
  }
  if (!Number.isFinite(probe.bytes) || probe.bytes <= 0) {
    throw new TypeError("Rendered artifact requires a positive file size");
  }
  if (!Number.isFinite(probe.durationSeconds) || probe.durationSeconds <= 0) {
    throw new TypeError("Rendered artifact requires a positive duration");
  }
  if (expectedDurationSeconds !== undefined) {
    const expected = Number(expectedDurationSeconds);
    const tolerance = Number(durationToleranceSeconds);
    if (!Number.isFinite(expected) || expected <= 0 || !Number.isFinite(tolerance) || tolerance < 0) {
      throw new TypeError("Duration tolerance check requires positive expected duration and non-negative tolerance");
    }
    if (Math.abs(probe.durationSeconds - expected) > tolerance) {
      throw new TypeError(
        `Rendered duration ${probe.durationSeconds}s exceeds tolerance ${tolerance}s around ${expected}s`
      );
    }
  }
  return probe;
}

function positiveNumberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
