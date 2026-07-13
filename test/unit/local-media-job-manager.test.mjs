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

test("local media jobs run one-at-a-time and expose no filesystem paths", async () => {
  const executions = [];
  const manager = createLocalMediaJobManager({
    maxConcurrent: 1,
    executeRender: ({ project, platform, signal }) => {
      const gate = deferred();
      executions.push({ project, platform, signal, gate });
      return gate.promise;
    }
  });

  const first = manager.submit({ project: { title: "One", cards: [{ id: "scene", text: "Renderable scene" }] }, platform: "youtube_video" });
  const second = manager.submit({ project: { title: "Two", cards: [{ id: "scene", text: "Renderable scene" }] }, platform: "youtube_shorts" });
  await Promise.resolve();

  assert.equal(manager.get(first.id).status, "running");
  assert.equal(manager.get(second.id).status, "queued");
  assert.equal(executions.length, 1);

  executions[0].gate.resolve({
    outputDir: "/tmp/private-run-one",
    manifestPath: "/tmp/private-run-one/master.manifest.json",
    manifestHashPath: "/tmp/private-run-one/master.manifest.json.sha256",
    manifest: {
      recipe: { id: "youtube-16x9-1080p" },
      blockers: [],
      warnings: [],
      artifacts: [{ name: "master.mp4", type: "video/mp4", bytes: 10, sha256: "a".repeat(64) }]
    }
  });
  await manager.waitFor(first.id);
  await Promise.resolve();

  const publicFirst = manager.get(first.id);
  assert.equal(publicFirst.status, "completed");
  assert.equal(JSON.stringify(publicFirst).includes("/tmp/private"), false);
  assert.deepEqual(publicFirst.artifacts.map(item => item.name), [
    "master.mp4",
    "master.manifest.json",
    "master.manifest.json.sha256"
  ]);
  assert.equal(executions.length, 2);
  assert.equal(manager.get(second.id).status, "running");

  executions[1].gate.resolve({
    outputDir: "/tmp/private-run-two",
    manifestPath: "/tmp/private-run-two/short.manifest.json",
    manifestHashPath: "/tmp/private-run-two/short.manifest.json.sha256",
    manifest: { recipe: { id: "shorts-9x16-1080p" }, blockers: [], warnings: [], artifacts: [] }
  });
  await manager.waitFor(second.id);
  assert.equal(manager.get(second.id).status, "completed");
});

test("local media job cancellation aborts execution and settles as cancelled", async () => {
  const started = deferred();
  const manager = createLocalMediaJobManager({
    executeRender: ({ signal }) => new Promise((_resolve, reject) => {
      started.resolve();
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })
  });
  const job = manager.submit({ project: { title: "Cancel", cards: [{ id: "scene", text: "Renderable scene" }] }, platform: "youtube_video" });
  await started.promise;

  assert.equal(manager.cancel(job.id), true);
  await manager.waitFor(job.id);
  assert.equal(manager.get(job.id).status, "cancelled");
  assert.equal(manager.cancel("missing"), false);
});

test("local media job manager rejects structurally unsafe projects before queueing", () => {
  let executions = 0;
  const manager = createLocalMediaJobManager({
    executeRender: async () => { executions += 1; }
  });
  const project = {
    schemaVersion: 1,
    title: "Deep",
    cards: [{ id: "one", text: "Scene" }],
    extra: {}
  };
  let cursor = project.extra;
  for (let index = 0; index < 80; index += 1) {
    cursor.next = {};
    cursor = cursor.next;
  }

  assert.throws(
    () => manager.submit({ project, platform: "youtube_video" }),
    /maximum depth/i
  );
  assert.equal(executions, 0);
});

test("render adapter paths cannot escape the private local run directory", async () => {
  const manager = createLocalMediaJobManager({
    executeRender: async () => ({
      outputDir: "/tmp/private-run",
      manifestPath: "/etc/passwd",
      manifestHashPath: "/tmp/private-run/master.manifest.json.sha256",
      manifest: { recipe: { id: "youtube-16x9-1080p" }, artifacts: [] }
    })
  });
  const job = manager.submit({
    project: { schemaVersion: 1, title: "Escape", cards: [{ id: "one", text: "Scene" }] },
    platform: "youtube_video"
  });
  await manager.waitFor(job.id);

  const failed = manager.get(job.id);
  assert.equal(failed.status, "failed");
  assert.equal(JSON.stringify(failed).includes("/etc/passwd"), false);
});

test("evicting a completed job invokes private artifact cleanup", async () => {
  const cleaned = [];
  const manager = createLocalMediaJobManager({
    maxJobs: 1,
    cleanupRender: async target => { cleaned.push(target); },
    executeRender: async ({ jobId }) => ({
      outputDir: `/tmp/${jobId}`,
      manifestPath: `/tmp/${jobId}/master.manifest.json`,
      manifestHashPath: `/tmp/${jobId}/master.manifest.json.sha256`,
      manifest: {
        recipe: { id: "youtube-16x9-1080p" },
        blockers: [],
        warnings: [],
        artifacts: []
      }
    })
  });
  const first = manager.submit({
    project: { title: "One", cards: [{ id: "one", text: "Scene one" }] },
    platform: "youtube_video"
  });
  await manager.waitFor(first.id);
  const second = manager.submit({
    project: { title: "Two", cards: [{ id: "two", text: "Scene two" }] },
    platform: "youtube_video"
  });
  await manager.waitFor(second.id);
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(manager.get(first.id), null);
  assert.deepEqual(cleaned, [{ outputDir: `/tmp/${first.id}`, jobId: first.id }]);
});

test("artifact resolution is allowlisted to completed job outputs", async () => {
  const manager = createLocalMediaJobManager({
    executeRender: async () => ({
      outputDir: "/tmp/private-run",
      manifestPath: "/tmp/private-run/master.manifest.json",
      manifestHashPath: "/tmp/private-run/master.manifest.json.sha256",
      manifest: {
        recipe: { id: "youtube-16x9-1080p" },
        blockers: [],
        warnings: [],
        artifacts: [{ name: "master.mp4", type: "video/mp4", bytes: 10, sha256: "a".repeat(64) }]
      }
    })
  });
  const job = manager.submit({ project: { title: "Done", cards: [{ id: "scene", text: "Renderable scene" }] }, platform: "youtube_video" });
  await manager.waitFor(job.id);

  assert.equal(manager.resolveArtifact(job.id, "master.mp4"), "/tmp/private-run/master.mp4");
  assert.throws(() => manager.resolveArtifact(job.id, "../secret"), /not available/);
  assert.throws(() => manager.resolveArtifact(job.id, "unknown.txt"), /not available/);
});
