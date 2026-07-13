import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRenderManifest,
  hashJson
} from "../../src/media/manifest.js";

const recipe = {
  schemaVersion: 1,
  version: "1.0.0",
  id: "youtube-16x9-1080p",
  platformId: "youtube_video",
  width: 1920,
  height: 1080,
  videoCodec: "libx264",
  audioCodec: "aac",
  adaptationMode: "master",
  readinessBlockers: []
};
const artifact = {
  name: "youtube-16x9-1080p.mp4",
  type: "video/mp4",
  bytes: 1200,
  sha256: "a".repeat(64),
  probe: {
    durationSeconds: 3.2,
    video: { codec: "h264", width: 1920, height: 1080 },
    audio: { codec: "aac", sampleRate: 48000, channels: 2 }
  }
};

const validTtsCommand = {
  id: "tts",
  tool: "ffmpeg",
  argv: [
    "-hide_banner", "-loglevel", "error", "-n", "-f", "lavfi",
    "-i", "flite=textfile=/tmp/private-run/narration.txt:voice=slt",
    "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le",
    "/tmp/private-run/narration.partial.wav"
  ]
};
const validRenderCommand = {
  id: "render",
  tool: "ffmpeg",
  argv: [
    "-hide_banner", "-loglevel", "error", "-n", "-f", "lavfi",
    "-i", "color=c=0x111827:s=1920x1080:r=30:d=3.200",
    "-i", "/tmp/private-run/narration.wav",
    "-map", "0:v:0", "-map", "1:a:0",
    "-vf", "subtitles=filename=/tmp/private-run/narration.srt:force_style='FontName=DejaVu Sans,Alignment=2,MarginV=80'",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
    "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac",
    "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-shortest",
    "-movflags", "+faststart", "/tmp/private-run/youtube.partial.mp4"
  ]
};

function build(overrides = {}) {
  return buildRenderManifest({
    project: { schemaVersion: 1, title: "Demo", cards: [{ id: "a" }] },
    storyboard: { schemaVersion: 1, scenes: [{ id: "scene-a" }] },
    recipe,
    tools: {
      ffmpeg: "ffmpeg version 8.0.1",
      ffprobe: "ffprobe version 8.0.1",
      renderer: "hermest-board-media-r1",
      tts: {
        provider: "ffmpeg-flite",
        model: "flite",
        voice: "slt",
        language: "en",
        apiToken: "must-not-survive"
      },
      apiToken: "secret-value"
    },
    commands: [validTtsCommand, validRenderCommand],
    qc: { passed: true, checks: ["ffprobe_streams", "artifact_hashes"] },
    blockers: ["semantic_edit_not_implemented"],
    warnings: ["offline_flite_voice_is_english_only"],
    lineage: { parents: ["project:demo"], children: ["artifact:video"] },
    artifacts: [artifact],
    ...overrides
  });
}

test("hashJson is deterministic across object key order", () => {
  assert.equal(hashJson({ a: 1, b: { c: 2 } }), hashJson({ b: { c: 2 }, a: 1 }));
  assert.match(hashJson({ a: 1 }), /^[a-f0-9]{64}$/);
});

test("render manifest is deterministic and records recipe, QC, commands and lineage", () => {
  const first = build();
  const second = build();

  assert.deepEqual(first, second);
  assert.equal("createdAt" in first, false);
  assert.equal(first.schemaVersion, 1);
  assert.equal(first.recipe.id, recipe.id);
  assert.equal(first.recipe.adaptationMode, "master");
  assert.match(first.recipeSha256, /^[a-f0-9]{64}$/);
  assert.match(first.inputs.projectSha256, /^[a-f0-9]{64}$/);
  assert.match(first.inputs.storyboardSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.artifacts[0].name, artifact.name);
  assert.equal("path" in first.artifacts[0], false);
  assert.equal(first.qc.passed, true);
  assert.deepEqual(first.lineage.parents, ["project:demo"]);
  assert.equal(first.commands[0].argv[7], "flite=textfile=<run>/narration.txt:voice=slt");
  assert.equal(first.commands[1].argv[9], "<run>/narration.wav");
  assert.equal(first.commands[1].argv.at(-1), "<run>/youtube.partial.mp4");
  assert.ok(first.blockers.includes("semantic_edit_not_implemented"));
});

test("render manifest allowlists tool metadata and removes secret-shaped fields", () => {
  const manifest = build();
  const serialized = JSON.stringify(manifest);

  assert.equal(manifest.tools.ffmpeg, "ffmpeg version 8.0.1");
  assert.equal(manifest.tools.tts.provider, "ffmpeg-flite");
  assert.equal("apiToken" in manifest.tools, false);
  assert.equal("apiToken" in manifest.tools.tts, false);
  assert.doesNotMatch(serialized, /secret-value|must-not-survive/);
});

test("render manifest rejects credential carriers outside the internal command schemas", () => {
  const sentinel = "review-sentinel-73f2";
  const authHeader = `${"Author" + "ization"}: ${"Bear" + "er"} ${sentinel}`;
  const counterexamples = [
    [`--header=${authHeader}`],
    [`-H${authHeader}`],
    [`https://${sentinel}@example.invalid/input`],
    ["--cookie", sentinel],
    ["--header", authHeader],
    ["-H", authHeader]
  ];
  for (const argv of counterexamples) {
    assert.throws(
      () => build({ commands: [{ id: "render", tool: "ffmpeg", argv }] }),
      /command argv schema/i
    );
  }
});

test("render manifest rejects unknown command evidence and unsafe argv shapes", () => {
  assert.throws(
    () => build({ commands: [{ id: "upload", tool: "curl", argv: ["https://example.invalid"] }] }),
    /unsupported command evidence/i
  );
  assert.throws(
    () => build({ commands: [{ id: "render", tool: "ffmpeg", argv: ["-i", "bad\u0000arg"] }] }),
    /unsafe command argument/i
  );
});

test("render manifest rejects unverifiable artifacts", () => {
  assert.throws(
    () => build({ artifacts: [{ name: "empty.mp4", bytes: 0, sha256: "" }] }),
    /verified bytes and sha256/
  );
});
