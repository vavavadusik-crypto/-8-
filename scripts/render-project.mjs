#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { preflightBoardInput, renderProject } from "../src/media/render-project.js";

const options = parseArgs(process.argv.slice(2));
if (!options.input) {
  process.stderr.write(
    "Usage: npm run render:project -- --input /safe/project.json [--output /safe/output] [--platform youtube_video]\n"
  );
  process.exitCode = 2;
} else {
  try {
    const output = options.output || path.resolve("tmp");
    if (!options.output) {
      await preflightBoardInput(options.input);
      await mkdir(output, { recursive: true, mode: 0o700 });
    }
    const result = await renderProject({
      inputPath: options.input,
      outputDir: output,
      platform: options.platform || "youtube_video"
    });
    process.stdout.write(`${JSON.stringify({
      status: "completed",
      platform: result.platform,
      recipeId: result.recipeId,
      outputDir: result.outputDir,
      videoFile: result.videoFile,
      manifestPath: result.manifestPath,
      manifestHashPath: result.manifestHashPath
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Hermest Board render failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!["--input", "--output", "--platform"].includes(key)) {
      throw new TypeError(`Unknown argument: ${key}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new TypeError(`Missing value for ${key}`);
    options[key.slice(2)] = value;
    index += 1;
  }
  return options;
}
