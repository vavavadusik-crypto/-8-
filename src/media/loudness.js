import { assertSafeGeneratedPath } from "./ffmpeg-args.js";
import { runMediaTool } from "./process-runner.js";

const TARGET_INTEGRATED_LUFS = -16;
const TARGET_TRUE_PEAK_DBTP = -1.5;
const TARGET_LOUDNESS_RANGE_LU = 11;
const MEASURE_TIMEOUT_MS = 300000;

export function buildLoudnessMeasureArgs({ inputFile }) {
  const safeInputFile = assertSafeGeneratedPath(inputFile);
  return [
    "-hide_banner", "-nostats",
    "-i", safeInputFile,
    "-map", "0:a:0",
    "-af", `loudnorm=I=${TARGET_INTEGRATED_LUFS}:TP=${TARGET_TRUE_PEAK_DBTP}:LRA=${TARGET_LOUDNESS_RANGE_LU}:print_format=json`,
    "-f", "null", "-"
  ];
}

// The loudnorm filter prints its measurement JSON to stderr at info level;
// the "input_*" fields of this pass are the measured loudness of the file.
export function parseLoudnormReport(stderrText) {
  const text = typeof stderrText === "string" ? stderrText : "";
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new TypeError("loudnorm report is missing from ffmpeg output");
  }
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new TypeError("loudnorm report is not valid JSON");
  }
  return {
    integratedLufs: finiteLoudnessNumber(parsed.input_i, "input_i"),
    truePeakDbtp: finiteLoudnessNumber(parsed.input_tp, "input_tp"),
    loudnessRangeLu: finiteLoudnessNumber(parsed.input_lra, "input_lra"),
    thresholdLufs: finiteLoudnessNumber(parsed.input_thresh, "input_thresh"),
    targetIntegratedLufs: TARGET_INTEGRATED_LUFS,
    targetTruePeakDbtp: TARGET_TRUE_PEAK_DBTP,
    targetLoudnessRangeLu: TARGET_LOUDNESS_RANGE_LU
  };
}

export async function measureRenderedLoudness(mediaFile, { runTool = runMediaTool, signal } = {}) {
  const command = {
    id: "loudness-measure",
    tool: "ffmpeg",
    argv: buildLoudnessMeasureArgs({ inputFile: mediaFile })
  };
  const { stderr } = await runTool(command.tool, command.argv, {
    timeoutMs: MEASURE_TIMEOUT_MS,
    signal
  });
  return { command, loudness: parseLoudnormReport(stderr) };
}

function finiteLoudnessNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`loudnorm report field ${field} is not a finite number`);
  }
  return number;
}
