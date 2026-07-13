import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { assertSafeGeneratedPath } from "./ffmpeg-args.js";
import { parseProbeOutput } from "./ffprobe.js";

const TOOL_PATHS = Object.freeze({
  ffmpeg: "/usr/bin/ffmpeg",
  ffprobe: "/usr/bin/ffprobe"
});
const SCRUBBED_ENV = Object.freeze({
  HOME: "/tmp",
  LANG: "C.UTF-8",
  LC_ALL: "C.UTF-8",
  PATH: "/usr/bin:/bin",
  TMPDIR: "/tmp"
});
const MAX_CAPTURE_CHARS = 128000;
const MAX_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const KILL_GRACE_MS = 2000;

export function getMediaToolDescriptor(tool) {
  const binaryPath = TOOL_PATHS[tool];
  if (!binaryPath) throw new RangeError(`Unsupported media tool: ${tool}`);
  return { path: binaryPath, env: { ...SCRUBBED_ENV } };
}

export async function runMediaTool(tool, args, { timeoutMs = 300000, signal } = {}) {
  const descriptor = getMediaToolDescriptor(tool);
  if (!Array.isArray(args) || args.some(value => typeof value !== "string")) {
    throw new TypeError("Media tool arguments must be a string array");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new RangeError(`Media tool timeout must be within 1..${MAX_TIMEOUT_MS}ms`);
  }
  signal?.throwIfAborted();

  return new Promise((resolve, reject) => {
    const child = spawn(descriptor.path, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: descriptor.env
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let terminationError = null;
    let killTimer = null;
    const append = (current, chunk) => `${current}${chunk}`.slice(-MAX_CAPTURE_CHARS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout = append(stdout, chunk); });
    child.stderr.on("data", chunk => { stderr = append(stderr, chunk); });

    const requestTermination = error => {
      if (terminationError || settled) return;
      terminationError = error;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, KILL_GRACE_MS);
    };
    const abortHandler = () => {
      requestTermination(signal?.reason instanceof Error
        ? signal.reason
        : new Error(`${tool} execution aborted`));
    };
    if (signal) signal.addEventListener("abort", abortHandler, { once: true });
    const timer = setTimeout(() => {
      requestTermination(new Error(`${tool} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (signal) signal.removeEventListener("abort", abortHandler);
    };
    const settle = callback => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    child.on("error", error => settle(() => reject(error)));
    child.on("close", code => settle(() => {
      if (terminationError) {
        reject(terminationError);
        return;
      }
      if (code !== 0) {
        reject(new Error(`${tool} exited ${code}: ${stderr.trim() || "no diagnostic output"}`));
        return;
      }
      resolve({ code, stdout, stderr });
    }));
  });
}

export async function probeMediaFile(filePath, { signal } = {}) {
  const safePath = assertSafeGeneratedPath(filePath);
  const { stdout } = await runMediaTool("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size",
    "-show_entries", "stream=index,codec_name,codec_type,width,height,sample_rate,channels",
    "-of", "json",
    safePath
  ], { timeoutMs: 60000, signal });
  return parseProbeOutput(stdout);
}

export async function mediaToolVersion(tool, { signal } = {}) {
  const { stdout } = await runMediaTool(tool, ["-version"], { timeoutMs: 30000, signal });
  return stdout.split(/\r?\n/u)[0].trim();
}

export async function describeArtifact(filePath, { name, type, probe = {} }) {
  const safePath = assertSafeGeneratedPath(filePath);
  const info = await stat(safePath);
  if (!info.isFile() || info.size <= 0) throw new TypeError(`Artifact is missing or empty: ${name}`);
  return {
    name,
    type,
    bytes: info.size,
    sha256: await hashFile(safePath),
    probe
  };
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
