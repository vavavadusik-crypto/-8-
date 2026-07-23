import assert from "node:assert/strict";
import test from "node:test";

import { createLocalMediaJobManager } from "../../src/local-media/job-manager.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const RENDERABLE_PROJECT = {
  title: "Analytics",
  cards: [{ id: "scene", text: "Renderable scene" }]
};

// Фикстура повторяет форму реального result.manifest из renderProject
// (см. src/media/render-project.js → buildRenderManifest): tts в tools,
// loudness в qc, probe.scenes у storyboard.json, probe.durationSeconds у mp4.
function fullManifestFixture() {
  return {
    schemaVersion: 1,
    renderer: "hermest-board-media-r1",
    recipe: { id: "youtube-16x9-1080p", version: 1, width: 1920, height: 1080 },
    tools: {
      ffmpeg: "ffmpeg version 6.1",
      tts: {
        provider: "elevenlabs",
        model: "eleven_multilingual_v2",
        voice: "George",
        language: "ru",
        durationSeconds: 41.9,
        sampleRate: 48000,
        channels: 1,
        codec: "pcm_s16le"
      }
    },
    qc: {
      passed: true,
      checks: ["audio_loudness_measured"],
      loudness: {
        integratedLufs: -16.4,
        truePeakDbtp: -2.1,
        loudnessRangeLu: 4.2,
        thresholdLufs: -27.1,
        targetIntegratedLufs: -16,
        targetTruePeakDbtp: -1.5,
        targetLoudnessRangeLu: 11
      }
    },
    blockers: [],
    warnings: [],
    footage: [
      { sceneIndex: 0, license: "pexels", sha256: "c".repeat(64), source: "stock", provider: "pexels" },
      { sceneIndex: 2, license: "pexels", sha256: "d".repeat(64), source: "stock", provider: "pexels" }
    ],
    music: { id: "ambient-01", title: "Calm", mood: "calm", license: "cc0", sha256: "e".repeat(64), source: "library" },
    artifacts: [
      {
        name: "storyboard.json",
        type: "application/json",
        bytes: 1400,
        sha256: "1".repeat(64),
        probe: { schemaVersion: 1, scenes: 6 }
      },
      {
        name: "narration.wav",
        type: "audio/wav",
        bytes: 4032044,
        sha256: "2".repeat(64),
        probe: { durationSeconds: 41.9 }
      },
      {
        name: "narration.srt",
        type: "application/x-subrip",
        bytes: 512,
        sha256: "3".repeat(64),
        probe: { durationSeconds: 41.9 }
      },
      {
        name: "youtube-16x9-1080p.mp4",
        type: "video/mp4",
        bytes: 9_100_000,
        sha256: "a".repeat(64),
        probe: { durationSeconds: 42.05, width: 1920, height: 1080 }
      }
    ]
  };
}

function renderResult(manifest) {
  return {
    outputDir: "/tmp/private-analytics-run",
    manifestPath: "/tmp/private-analytics-run/youtube-16x9-1080p.manifest.json",
    manifestHashPath: "/tmp/private-analytics-run/youtube-16x9-1080p.manifest.json.sha256",
    manifest
  };
}

test("completed render job exposes analytics derived from the verified manifest", async () => {
  const manager = createLocalMediaJobManager({
    executeRender: async () => renderResult(fullManifestFixture())
  });

  const job = manager.submit({ project: RENDERABLE_PROJECT, platform: "youtube_video" });
  await manager.waitFor(job.id);

  const completed = manager.get(job.id);
  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.analytics, {
    durationSeconds: 42.05,
    integratedLufs: -16.4,
    loudnessRangeLu: 4.2,
    voice: "George",
    language: "ru",
    recipeId: "youtube-16x9-1080p",
    sceneCount: 6,
    musicUsed: true,
    artifactCount: 6,
    totalBytes: 1400 + 4032044 + 512 + 9_100_000,
    videoBytes: 9_100_000,
    videoSha256: "a".repeat(64)
  });
  assert.equal(JSON.stringify(completed.analytics).includes("/tmp"), false);
});

test("sparse manifest degrades analytics to null/0 without inventing values", async () => {
  const manager = createLocalMediaJobManager({
    executeRender: async () => renderResult({
      recipe: { id: "youtube-16x9-1080p" },
      qc: { passed: true },
      blockers: [],
      warnings: [],
      artifacts: []
    })
  });

  const job = manager.submit({ project: RENDERABLE_PROJECT, platform: "youtube_video" });
  await manager.waitFor(job.id);

  const completed = manager.get(job.id);
  assert.equal(completed.status, "completed");
  assert.deepEqual(completed.analytics, {
    durationSeconds: null,
    integratedLufs: null,
    loudnessRangeLu: null,
    voice: null,
    language: null,
    recipeId: "youtube-16x9-1080p",
    sceneCount: 0,
    musicUsed: false,
    artifactCount: 2,
    totalBytes: 0,
    videoBytes: 0,
    videoSha256: null
  });
});

test("scene count falls back to distinct footage scenes when the storyboard probe is absent", async () => {
  const manifest = fullManifestFixture();
  manifest.artifacts = manifest.artifacts.filter(artifact => artifact.name !== "storyboard.json");
  const manager = createLocalMediaJobManager({
    executeRender: async () => renderResult(manifest)
  });

  const job = manager.submit({ project: RENDERABLE_PROJECT, platform: "youtube_video" });
  await manager.waitFor(job.id);

  const completed = manager.get(job.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.analytics.sceneCount, 2);
});

test("hostile manifest strings are sanitized and invalid hashes rejected in analytics", async () => {
  const manifest = fullManifestFixture();
  manifest.tools.tts.voice = "/etc/passwd stolen voice " + "x".repeat(200);
  manifest.tools.tts.language = 12345;
  manifest.qc.loudness.integratedLufs = Number.NaN;
  const video = manifest.artifacts.find(artifact => artifact.type === "video/mp4");
  video.probe = { durationSeconds: Number.POSITIVE_INFINITY };
  video.sha256 = "A".repeat(64);
  const manager = createLocalMediaJobManager({
    executeRender: async () => renderResult(manifest)
  });

  const job = manager.submit({ project: RENDERABLE_PROJECT, platform: "youtube_video" });
  await manager.waitFor(job.id);

  const analytics = manager.get(job.id).analytics;
  // Невалидная probe-длительность (Infinity) отвергнута → честный fallback на tts.
  assert.equal(analytics.durationSeconds, 41.9);
  assert.equal(analytics.integratedLufs, null);
  assert.equal(analytics.language, null);
  assert.equal(typeof analytics.voice, "string");
  assert.equal(analytics.voice.includes("/etc/passwd"), false);
  assert.equal(analytics.voice.startsWith("<path>"), true);
  assert.ok(analytics.voice.length <= 80);
  // sha256 нормализуется к lower-case, а не отбрасывается: значение верное.
  assert.equal(analytics.videoSha256, "a".repeat(64));
});

test("queued, running, failed and cancelled jobs never expose analytics", async () => {
  const gates = [];
  const manager = createLocalMediaJobManager({
    maxConcurrent: 1,
    executeRender: () => {
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    }
  });

  const running = manager.submit({ project: RENDERABLE_PROJECT, platform: "youtube_video" });
  const queued = manager.submit({ project: RENDERABLE_PROJECT, platform: "youtube_video" });
  await Promise.resolve();

  assert.equal(manager.get(running.id).status, "running");
  assert.equal("analytics" in manager.get(running.id), false);
  assert.equal(manager.get(queued.id).status, "queued");
  assert.equal("analytics" in manager.get(queued.id), false);

  const cancelled = manager.cancel(queued.id);
  assert.equal(cancelled.outcome, "cancelled");
  assert.equal("analytics" in manager.get(queued.id), false);

  gates[0].reject(new Error("render exploded"));
  await manager.waitFor(running.id);
  assert.equal(manager.get(running.id).status, "failed");
  assert.equal("analytics" in manager.get(running.id), false);
});

test("cancellation racing a late successful result never publishes analytics", async () => {
  let releasePersist;
  const persistGate = new Promise(resolve => { releasePersist = resolve; });
  const manager = createLocalMediaJobManager({
    verifyArtifactEvidence: async () => {},
    persistVerifiedCandidate: async () => {
      await persistGate;
      return {
        id: "cand_late",
        digest: "d".repeat(64),
        version: 1,
        status: "sealed",
        approvable: true,
        approvalBlockers: []
      };
    },
    executeRender: async () => ({
      ...renderResult(fullManifestFixture()),
      manifestArtifact: {
        name: "youtube-16x9-1080p.manifest.json",
        type: "application/json",
        bytes: 2000,
        sha256: "b".repeat(64)
      }
    })
  });

  const job = manager.submit({
    projectId: "project_analytics_race",
    project: RENDERABLE_PROJECT,
    platform: "youtube_video"
  });
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));

  manager.cancel(job.id);
  releasePersist();
  await manager.waitFor(job.id);

  const final = manager.get(job.id);
  assert.equal(final.status, "cancelled");
  assert.equal("analytics" in final, false);
});
