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
const SENSITIVE_FLAG = /^(?:--?(?:api[-_]?key|token|secret|password|authorization)|authorization)$/i;
const SENSITIVE_ASSIGNMENT = /^(.*(?:api[-_]?key|token|secret|password|authorization)[^=]*=).*/i;
const HEADER_FLAG = /^(?:--header|-H)$/i;
const AUTHORIZATION_CARRIER = /^(?:authorization|proxy-authorization)\s*:/i;
const CREDENTIAL_URL = /^[a-z][a-z0-9+.-]*:\/\/[^/@\s:]+:[^/@\s]+@/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const ALLOWED_COMMAND_TOOLS = Object.freeze({ tts: "ffmpeg", render: "ffmpeg" });
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
    if (!id || ALLOWED_COMMAND_TOOLS[id] !== tool) {
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
      if (
        CONTROL_CHARACTER.test(argument) ||
        Buffer.byteLength(argument, "utf8") > MAX_COMMAND_ARGUMENT_BYTES
      ) {
        throw new TypeError(`Unsafe command argument at ${commandIndex}:${argumentIndex}`);
      }
      return argument;
    });
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
      if (AUTHORIZATION_CARRIER.test(argument)) return "<redacted>";
      if (CREDENTIAL_URL.test(argument)) return "<redacted-url>";
      if (SENSITIVE_ASSIGNMENT.test(argument)) return argument.replace(SENSITIVE_ASSIGNMENT, "$1<redacted>");
      return redactRunPath(argument);
    });
    return { id, tool, argv: sanitized };
  });
}

function redactRunPath(argument) {
  if (argument.startsWith("/")) return `<run>/${path.posix.basename(argument)}`;
  return argument.replace(/(=)(\/[A-Za-z0-9_./-]+)/g, (_match, prefix, absolutePath) => (
    `${prefix}<run>/${path.posix.basename(absolutePath)}`
  ));
}

function normalizeQc(qc) {
  const source = qc && typeof qc === "object" && !Array.isArray(qc) ? qc : {};
  return {
    passed: source.passed === true,
    checks: uniqueText(source.checks)
  };
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
