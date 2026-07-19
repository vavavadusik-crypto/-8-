import assert from "node:assert/strict";
import test from "node:test";

import { measureRenderedLoudness, parseLoudnormReport } from "../../src/media/loudness.js";

const REPORT_STDERR = [
  "Stream mapping:",
  "  Stream #0:1 -> #0:0 (aac (native) -> pcm_s16le (native))",
  "[Parsed_loudnorm_0 @ 0x55d] ",
  "{",
  "\t\"input_i\" : \"-15.98\",",
  "\t\"input_tp\" : \"-1.62\",",
  "\t\"input_lra\" : \"4.10\",",
  "\t\"input_thresh\" : \"-26.34\",",
  "\t\"output_i\" : \"-16.00\",",
  "\t\"output_tp\" : \"-1.50\",",
  "\t\"output_lra\" : \"4.00\",",
  "\t\"output_thresh\" : \"-26.40\",",
  "\t\"normalization_type\" : \"dynamic\",",
  "\t\"target_offset\" : \"0.02\"",
  "}"
].join("\n");

test("loudnorm report parsing extracts measured loudness from ffmpeg stderr", () => {
  const report = parseLoudnormReport(REPORT_STDERR);

  assert.equal(report.integratedLufs, -15.98);
  assert.equal(report.truePeakDbtp, -1.62);
  assert.equal(report.loudnessRangeLu, 4.1);
  assert.equal(report.thresholdLufs, -26.34);
  assert.equal(report.targetIntegratedLufs, -16);
  assert.equal(report.targetTruePeakDbtp, -1.5);
});

test("loudnorm report parsing fails closed on missing or malformed output", () => {
  assert.throws(() => parseLoudnormReport("no json here"), TypeError);
  assert.throws(() => parseLoudnormReport(""), TypeError);
  assert.throws(
    () => parseLoudnormReport('{ "input_i" : "not-a-number", "input_tp" : "-1", "input_lra" : "1", "input_thresh" : "-20" }'),
    TypeError
  );
});

test("measureRenderedLoudness runs ffmpeg with an audited command and returns the report", async () => {
  const calls = [];
  const { command, loudness } = await measureRenderedLoudness("/tmp/private-run/youtube.mp4", {
    runTool: async (tool, argv) => {
      calls.push({ tool, argv });
      return { code: 0, stdout: "", stderr: REPORT_STDERR };
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].tool, "ffmpeg");
  assert.equal(command.id, "loudness-measure");
  assert.equal(command.tool, "ffmpeg");
  assert.deepEqual(command.argv, calls[0].argv);
  assert.ok(command.argv.includes("/tmp/private-run/youtube.mp4"));
  assert.ok(command.argv.some(argument => argument.startsWith("loudnorm=") && argument.includes("print_format=json")));
  assert.equal(command.argv.at(-2), "null");
  assert.equal(command.argv.at(-1), "-");
  assert.equal(loudness.integratedLufs, -15.98);
});

test("measureRenderedLoudness rejects unsafe media paths", async () => {
  await assert.rejects(
    () => measureRenderedLoudness("/tmp/evil path/video.mp4", { runTool: async () => ({ stderr: REPORT_STDERR }) }),
    /safe generated path/
  );
});
