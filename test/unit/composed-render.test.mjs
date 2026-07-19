import assert from "node:assert/strict";
import test from "node:test";

import { buildComposedVideoRenderArgs } from "../../src/media/ffmpeg-args.js";
import { buildRenderManifest } from "../../src/media/manifest.js";

const recipe = Object.freeze({
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: "libx264",
  audioCodec: "aac",
  pixelFormat: "yuv420p",
  audioSampleRate: 48000,
  audioChannels: 2,
  safeZones: { bottom: 96 },
  loudnessTargetLufs: -16
});

const sceneFrames = Object.freeze([
  Object.freeze({ path: "/tmp/run/scene-001.png", durationSeconds: 4.2 }),
  Object.freeze({ path: "/tmp/run/scene-002.png", durationSeconds: 5.1 })
]);

function buildArgs(overrides = {}) {
  return buildComposedVideoRenderArgs({
    sceneFrames,
    audioFile: "/tmp/run/narration.wav",
    subtitleFile: "/tmp/run/narration.srt",
    outputFile: "/tmp/run/out.partial.mp4",
    durationSeconds: 9.3,
    recipe,
    ...overrides
  });
}

test("composed render args interleave per-frame inputs and concat them", () => {
  const args = buildArgs();
  assert.deepEqual(args.slice(0, 4), ["-hide_banner", "-loglevel", "error", "-n"]);
  assert.ok(args.includes("/tmp/run/scene-001.png"));
  assert.ok(args.includes("/tmp/run/scene-002.png"));
  const filterComplex = args[args.indexOf("-filter_complex") + 1];
  assert.match(filterComplex, /concat=n=2:v=1:a=0\[vc\]/);
  assert.match(filterComplex, /subtitles=filename=\/tmp\/run\/narration\.srt/);
  assert.equal(args[args.indexOf("-map") + 1], "[vout]");
  assert.ok(args.includes("2:a:0"));
});

test("composed render args validate frames and duration", () => {
  assert.throws(() => buildArgs({ sceneFrames: [] }), RangeError);
  assert.throws(() => buildArgs({
    sceneFrames: [{ path: "/tmp/run/scene.png", durationSeconds: 0 }]
  }), RangeError);
  assert.throws(() => buildArgs({
    sceneFrames: [{ path: "../evil.png", durationSeconds: 2 }]
  }), TypeError);
  assert.throws(() => buildArgs({ durationSeconds: 0 }), RangeError);
});

function manifestWith(commands) {
  return buildRenderManifest({
    project: { cards: [] },
    storyboard: { schemaVersion: 1, scenes: [] },
    recipe: { id: "youtube-16x9-1080p", platformId: "youtube_video" },
    tools: { ffmpeg: "8.0.1", ffprobe: "8.0.1", renderer: "hermest-board-media-r1", sceneComposer: "scene-markup@1" },
    commands,
    qc: { passed: true, checks: ["composed_scene_frames"] },
    blockers: [],
    warnings: [],
    lineage: { parents: [], children: [] },
    artifacts: [{ name: "a.mp4", type: "video/mp4", bytes: 10, sha256: "a".repeat(64) }]
  });
}

test("manifest accepts the locked scene-frame chrome schema and keeps composer lineage", () => {
  const manifest = manifestWith([{
    id: "scene-frame",
    tool: "chrome",
    argv: [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--user-data-dir=/tmp/run/chrome-profile",
      "--window-size=1920,1080",
      "--screenshot=/tmp/run/scene-001.png",
      "file:///tmp/run/scene-001.html"
    ]
  }]);
  assert.equal(manifest.tools.sceneComposer, "scene-markup@1");
  assert.equal(manifest.commands.length, 1);
  assert.ok(manifest.commands[0].argv.includes("file://<run>/scene-001.html"));
  assert.ok(!JSON.stringify(manifest.commands).includes("/tmp/run/"));
});

test("manifest accepts the composed ffmpeg render schema", () => {
  const manifest = manifestWith([{
    id: "render-composed",
    tool: "ffmpeg",
    argv: buildArgs()
  }]);
  assert.equal(manifest.commands[0].id, "render-composed");
});

test("manifest rejects scene-frame drift from the locked schema", () => {
  assert.throws(() => manifestWith([{
    id: "scene-frame",
    tool: "chrome",
    argv: ["--headless=new", "--disable-gpu", "--remote-debugging-port=9222"]
  }]), /schema mismatch|Unsupported/);
  assert.throws(() => manifestWith([{
    id: "scene-frame",
    tool: "ffmpeg",
    argv: ["-i", "/tmp/x.png"]
  }]), /Unsupported command evidence/);
  assert.throws(() => manifestWith([{
    id: "scene-frame",
    tool: "chrome",
    argv: [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--user-data-dir=/tmp/run/chrome-profile",
      "--window-size=1920,1080",
      "--screenshot=/tmp/run/scene-001.png",
      "https://evil.example/page.html"
    ]
  }]), /schema mismatch/);
});

test("composed render args support b-roll overlay scenes", () => {
  const args = buildArgs({
    sceneFrames: [
      { path: "/tmp/run/scene-001.png", durationSeconds: 4.2 },
      { path: "/tmp/run/scene-002.png", durationSeconds: 5.1, brollPath: "/tmp/run/broll-002.mp4" }
    ]
  });
  assert.ok(args.includes("-stream_loop"));
  assert.ok(args.includes("/tmp/run/broll-002.mp4"));
  const filterComplex = args[args.indexOf("-filter_complex") + 1];
  assert.match(filterComplex, /force_original_aspect_ratio=increase/);
  assert.match(filterComplex, /\[b1\]\[f1\]overlay=0:0,format=yuv420p\[v1\]/);
  assert.ok(args.includes("3:a:0"));
  assert.throws(() => buildArgs({
    sceneFrames: [{ path: "/tmp/run/s.png", durationSeconds: 2, brollPath: "../evil.mp4" }]
  }), TypeError);
});

test("manifest accepts the b-roll composed schema and footage provenance", () => {
  const args = buildArgs({
    sceneFrames: [
      { path: "/tmp/run/scene-001.png", durationSeconds: 4.2 },
      { path: "/tmp/run/scene-002.png", durationSeconds: 5.1, brollPath: "/tmp/run/broll-002.mp4" }
    ]
  });
  const manifest = buildRenderManifest({
    project: { cards: [] },
    storyboard: { schemaVersion: 1, scenes: [] },
    recipe: { id: "youtube-16x9-1080p", platformId: "youtube_video" },
    tools: { ffmpeg: "8.0.1", ffprobe: "8.0.1", renderer: "hermest-board-media-r1" },
    commands: [{ id: "render-composed", tool: "ffmpeg", argv: args }],
    qc: { passed: true, checks: ["broll_footage_provenance"] },
    blockers: [],
    warnings: [],
    lineage: { parents: [], children: [] },
    footage: [{
      sceneIndex: 1,
      license: "pexels",
      sha256: "b".repeat(64),
      provenance: { source: "stock", provider: "pexels", author: "Автор", url: "https://www.pexels.com/video/101/" }
    }],
    artifacts: [{ name: "a.mp4", type: "video/mp4", bytes: 10, sha256: "a".repeat(64) }]
  });
  assert.equal(manifest.footage.length, 1);
  assert.equal(manifest.footage[0].provider, "pexels");
  assert.equal(manifest.footage[0].url, "https://www.pexels.com/video/101/");
  assert.throws(() => buildRenderManifest({
    project: { cards: [] },
    storyboard: { schemaVersion: 1, scenes: [] },
    recipe: { id: "r", platformId: "p" },
    tools: {},
    commands: [],
    qc: {},
    blockers: [],
    warnings: [],
    lineage: {},
    footage: [{ sceneIndex: 1, license: "", sha256: "b".repeat(64) }],
    artifacts: [{ name: "a.mp4", type: "video/mp4", bytes: 10, sha256: "a".repeat(64) }]
  }), /without a license/);
});

test("manifest rejects composed render drift", () => {
  const args = buildArgs();
  const tampered = [...args];
  tampered[tampered.indexOf("-filter_complex") + 1] += ";[vout]drawtext=text=x[v2]";
  assert.throws(() => manifestWith([{
    id: "render-composed",
    tool: "ffmpeg",
    argv: tampered
  }]), /schema mismatch/);
});
