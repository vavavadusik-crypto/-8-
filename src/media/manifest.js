import { createHash } from "node:crypto";
import path from "node:path";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TOOL_TEXT_KEYS = ["ffmpeg", "ffprobe", "renderer"];
const TTS_KEYS = [
  "provider",
  "model",
  "voice",
  "language",
  "durationSeconds",
  "sampleRate",
  "channels",
  "codec",
  "scriptSha256"
];
const SENSITIVE_FLAG = /^(?:--?(?:api[-_]?key|token|secret|password|authorization|cookie|credential)|authorization)$/i;
const SENSITIVE_ASSIGNMENT = /^(.*(?:api[-_]?key|token|secret|password|authorization|cookie|credential)[^=]*=).*/i;
const HEADER_FLAG = /^(?:--?headers?|--cookie)(?:=|$)/i;
const SENSITIVE_HEADER_CARRIER = /(?:^|[=\r\n])\s*(?:authorization|proxy-authorization|cookie|set-cookie)\s*:/i;
const CREDENTIAL_URL = /[a-z][a-z0-9+.-]*:\/\/[^/\s"'<>]*(?:@|%40)/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const ALLOWED_COMMAND_TOOLS = Object.freeze({
  tts: Object.freeze(["ffmpeg", "piper"]),
  "narration-canonicalize": Object.freeze(["ffmpeg"]),
  render: Object.freeze(["ffmpeg"]),
  "loudness-measure": Object.freeze(["ffmpeg"])
});
const LOUDNESS_KEYS = Object.freeze([
  "integratedLufs",
  "truePeakDbtp",
  "loudnessRangeLu",
  "thresholdLufs",
  "targetIntegratedLufs",
  "targetTruePeakDbtp",
  "targetLoudnessRangeLu"
]);
const MAX_COMMAND_ARGUMENTS = 512;
const MAX_COMMAND_ARGUMENT_BYTES = 16384;

export function hashJson(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function buildRenderManifest({
  project,
  storyboard,
  recipe,
  tools,
  commands = [],
  qc = {},
  blockers = [],
  warnings = [],
  lineage = {},
  artifacts
}) {
  const normalizedRecipe = sortValue(structuredClone(recipe || {}));
  const verifiedArtifacts = (Array.isArray(artifacts) ? artifacts : []).map(normalizeArtifact);
  return {
    schemaVersion: 1,
    renderer: "hermest-board-media-r1",
    inputs: {
      projectSha256: hashJson(project),
      storyboardSha256: hashJson(storyboard)
    },
    recipe: normalizedRecipe,
    recipeSha256: hashJson(normalizedRecipe),
    tools: normalizeTools(tools),
    commands: normalizeCommands(commands),
    qc: normalizeQc(qc),
    blockers: uniqueText(blockers),
    warnings: uniqueText(warnings),
    lineage: normalizeLineage(lineage),
    artifacts: verifiedArtifacts
  };
}

function normalizeArtifact(artifact) {
  const bytes = Number(artifact?.bytes);
  const sha256 = String(artifact?.sha256 || "");
  if (!Number.isFinite(bytes) || bytes <= 0 || !SHA256_PATTERN.test(sha256)) {
    throw new TypeError("Render artifacts require verified bytes and sha256");
  }
  return {
    name: safeText(artifact?.name),
    type: safeText(artifact?.type) || "application/octet-stream",
    bytes,
    sha256,
    probe: sortValue(structuredClone(artifact?.probe || {}))
  };
}

function normalizeTools(tools) {
  const source = tools && typeof tools === "object" && !Array.isArray(tools) ? tools : {};
  const normalized = {};
  for (const key of TOOL_TEXT_KEYS) {
    const value = source[key];
    if (["string", "number", "boolean"].includes(typeof value)) normalized[key] = value;
  }
  if (source.tts && typeof source.tts === "object" && !Array.isArray(source.tts)) {
    const tts = {};
    for (const key of TTS_KEYS) {
      const value = source.tts[key];
      if (["string", "number", "boolean"].includes(typeof value)) tts[key] = value;
    }
    if (Object.keys(tts).length > 0) normalized.tts = tts;
  }
  return normalized;
}

function normalizeCommands(commands) {
  if (!Array.isArray(commands)) return [];
  return commands.map((command, commandIndex) => {
    if (!command || typeof command !== "object" || Array.isArray(command)) {
      throw new TypeError(`Invalid command evidence at index ${commandIndex}`);
    }
    const id = safeText(command.id);
    const tool = safeText(command.tool);
    if (!id || !ALLOWED_COMMAND_TOOLS[id]?.includes(tool)) {
      throw new TypeError(`Unsupported command evidence at index ${commandIndex}`);
    }
    if (!Array.isArray(command.argv) || command.argv.length === 0 || command.argv.length > MAX_COMMAND_ARGUMENTS) {
      throw new TypeError(`Unsafe command argument list at index ${commandIndex}`);
    }
    const argv = command.argv.map((value, argumentIndex) => {
      if (typeof value !== "string" && typeof value !== "number") {
        throw new TypeError(`Unsafe command argument at ${commandIndex}:${argumentIndex}`);
      }
      const argument = String(value);
      if (isSensitiveCommandArgument(argument)) {
        throw new TypeError(`Sensitive command argument at ${commandIndex}:${argumentIndex}`);
      }
      if (
        CONTROL_CHARACTER.test(argument) ||
        Buffer.byteLength(argument, "utf8") > MAX_COMMAND_ARGUMENT_BYTES
      ) {
        throw new TypeError(`Unsafe command argument at ${commandIndex}:${argumentIndex}`);
      }
      return argument;
    });
    validateCommandArgv(id, tool, argv, commandIndex);
    let redactNext = false;
    const sanitized = argv.map(argument => {
      if (redactNext) {
        redactNext = false;
        return "<redacted>";
      }
      if (HEADER_FLAG.test(argument) || SENSITIVE_FLAG.test(argument)) {
        redactNext = true;
        return argument;
      }
      if (SENSITIVE_HEADER_CARRIER.test(argument)) return "<redacted>";
      if (CREDENTIAL_URL.test(argument)) return "<redacted-url>";
      if (SENSITIVE_ASSIGNMENT.test(argument)) return argument.replace(SENSITIVE_ASSIGNMENT, "$1<redacted>");
      return redactRunPath(argument);
    });
    return { id, tool, argv: sanitized };
  });
}

function isSensitiveCommandArgument(argument) {
  const normalized = String(argument).trimStart();
  if (normalized.startsWith("-H")) return true;
  return HEADER_FLAG.test(normalized)
    || SENSITIVE_FLAG.test(normalized)
    || SENSITIVE_HEADER_CARRIER.test(normalized)
    || CREDENTIAL_URL.test(normalized)
    || SENSITIVE_ASSIGNMENT.test(normalized);
}

function validateCommandArgv(id, tool, argv, commandIndex) {
  try {
    if (id === "tts" && tool === "piper") validatePiperTtsArgv(argv);
    else if (id === "tts") validateTtsArgv(argv);
    else if (id === "narration-canonicalize" && tool === "ffmpeg") validateNarrationCanonicalizeArgv(argv);
    else if (id === "loudness-measure" && tool === "ffmpeg") validateLoudnessMeasureArgv(argv);
    else if (id === "render") validateRenderArgv(argv);
    else throw new TypeError("unsupported schema");
  } catch {
    throw new TypeError(`Command argv schema mismatch at index ${commandIndex}`);
  }
}

function validatePiperTtsArgv(argv) {
  const decimal = /^\d+(?:\.\d{1,3})?$/;
  const cursor = argvCursor(argv);
  cursor.expect("--model");
  const model = cursor.take();
  if (!model.endsWith(".onnx") || !isSafeGeneratedPath(model)) throw new TypeError("invalid piper model");
  cursor.expect("--output_file");
  if (!isSafeGeneratedPath(cursor.take())) throw new TypeError("invalid piper output");
  cursor.expect("--noise_scale");
  if (!decimal.test(cursor.take())) throw new TypeError("invalid piper noise scale");
  cursor.expect("--noise_w");
  if (!decimal.test(cursor.take())) throw new TypeError("invalid piper noise width");
  cursor.expect("--sentence_silence");
  if (!decimal.test(cursor.take())) throw new TypeError("invalid piper silence");
  cursor.finish();
}

function validateTtsArgv(argv) {
  const cursor = argvCursor(argv);
  cursor.expect("-hide_banner", "-loglevel", "error", "-n", "-f", "lavfi", "-i");
  const source = cursor.take();
  const match = source.match(/^flite=textfile=(\/[A-Za-z0-9_./-]+):voice=(slt|awb|kal|kal16|rms)$/);
  if (!match || !isSafeGeneratedPath(match[1])) throw new TypeError("invalid flite source");
  cursor.expect("-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le");
  if (!isSafeGeneratedPath(cursor.take())) throw new TypeError("invalid TTS output");
  cursor.finish();
}

function validateLoudnessMeasureArgv(argv) {
  const cursor = argvCursor(argv);
  cursor.expect("-hide_banner", "-nostats", "-i");
  if (!isSafeGeneratedPath(cursor.take())) throw new TypeError("invalid loudness input");
  cursor.expect("-map", "0:a:0", "-af");
  if (!/^loudnorm=I=-?\d+(?:\.\d+)?:TP=-?\d+(?:\.\d+)?:LRA=\d+(?:\.\d+)?:print_format=json$/.test(cursor.take())) {
    throw new TypeError("invalid loudness filter");
  }
  cursor.expect("-f", "null", "-");
  cursor.finish();
}

function validateNarrationCanonicalizeArgv(argv) {
  const cursor = argvCursor(argv);
  cursor.expect("-hide_banner", "-loglevel", "error", "-n", "-i");
  if (!isSafeGeneratedPath(cursor.take())) throw new TypeError("invalid canonicalize input");
  cursor.expect("-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le");
  if (!isSafeGeneratedPath(cursor.take())) throw new TypeError("invalid canonicalize output");
  cursor.finish();
}

function validateRenderArgv(argv) {
  const cursor = argvCursor(argv);
  cursor.expect("-hide_banner", "-loglevel", "error", "-n", "-f", "lavfi", "-i");
  if (!/^color=c=0x[0-9a-f]{6}:s=\d+x\d+:r=\d+:d=\d+\.\d{3}$/i.test(cursor.take())) {
    throw new TypeError("invalid color source");
  }
  cursor.expect("-i");
  if (!isSafeGeneratedPath(cursor.take())) throw new TypeError("invalid narration input");
  cursor.expect("-map", "0:v:0", "-map", "1:a:0", "-vf");
  const videoFilter = cursor.take();
  if (
    !/^(?:drawtext=|subtitles=)/.test(videoFilter) ||
    !/subtitles=filename=\/[A-Za-z0-9_./-]+:force_style=/.test(videoFilter) ||
    /(?:[a-z][a-z0-9+.-]*:\/\/|authorization|cookie|--header)/i.test(videoFilter)
  ) {
    throw new TypeError("invalid video filter");
  }
  cursor.expect(
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
    "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac",
    "-b:a", "192k", "-ar", "48000", "-ac", "2", "-af"
  );
  if (!/^loudnorm=I=-?\d+(?:\.\d+)?:TP=-1\.5:LRA=11$/.test(cursor.take())) {
    throw new TypeError("invalid audio filter");
  }
  cursor.expect("-shortest", "-movflags", "+faststart");
  if (!isSafeGeneratedPath(cursor.take())) throw new TypeError("invalid render output");
  cursor.finish();
}

function argvCursor(argv) {
  let index = 0;
  return {
    expect(...expected) {
      for (const value of expected) {
        if (argv[index] !== value) throw new TypeError("unexpected argument");
        index += 1;
      }
    },
    take() {
      if (index >= argv.length) throw new TypeError("missing argument");
      const value = argv[index];
      index += 1;
      return value;
    },
    finish() {
      if (index !== argv.length) throw new TypeError("unexpected trailing argument");
    }
  };
}

function isSafeGeneratedPath(value) {
  return /^\/[A-Za-z0-9_./-]+$/.test(value) && path.posix.normalize(value) === value;
}

function redactRunPath(argument) {
  if (argument.startsWith("/")) return `<run>/${path.posix.basename(argument)}`;
  return argument.replace(/(=)(\/[A-Za-z0-9_./-]+)/g, (_match, prefix, absolutePath) => (
    `${prefix}<run>/${path.posix.basename(absolutePath)}`
  ));
}

function normalizeQc(qc) {
  const source = qc && typeof qc === "object" && !Array.isArray(qc) ? qc : {};
  const normalized = {
    passed: source.passed === true,
    checks: uniqueText(source.checks)
  };
  if (source.loudness !== undefined) {
    normalized.loudness = normalizeLoudness(source.loudness);
  }
  return normalized;
}

function normalizeLoudness(loudness) {
  if (!loudness || typeof loudness !== "object" || Array.isArray(loudness)) {
    throw new TypeError("QC loudness report must be an object");
  }
  const normalized = {};
  for (const key of LOUDNESS_KEYS) {
    const value = Number(loudness[key]);
    if (!Number.isFinite(value)) {
      throw new TypeError(`QC loudness field ${key} must be a finite number`);
    }
    normalized[key] = value;
  }
  return normalized;
}

function normalizeLineage(lineage) {
  const source = lineage && typeof lineage === "object" && !Array.isArray(lineage) ? lineage : {};
  return {
    parents: uniqueText(source.parents),
    children: uniqueText(source.children)
  };
}

function uniqueText(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(safeText).filter(Boolean))];
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, sortValue(value[key])])
  );
}
