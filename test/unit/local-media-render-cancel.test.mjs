// HTTP-контракт отмены render-job (docs/RENDER_CANCEL_MILESTONE_HANDOFF.md,
// «Общий API-контракт»):
// 202 идемпотентно для queued/running и повторной отмены,
// 404 local_media_job_not_found для неизвестного id,
// 409 local_media_job_not_cancellable для терминальных completed/failed,
// поздний результат рендера никогда не воскрешает отменённый job,
// и ни один из этих путей не роняет middleware и не отвечает 500.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createDraftJobManager } from "../../src/local-media/draft-job-manager.js";
import { createLocalMediaJobManager } from "../../src/local-media/job-manager.js";
import { createLocalMediaRequestHandler } from "../../src/local-media/vite-plugin.js";

const RENDER_PROJECT = { title: "Cancel", cards: [{ id: "scene", text: "Renderable scene" }] };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function startServer(t, manager) {
  const draftManager = createDraftJobManager({ runDraft: async () => ({ board: {} }) });
  const server = createServer(createLocalMediaRequestHandler({ manager, draftManager }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));
  return origin;
}

function cancelJob(origin, id) {
  return fetch(`${origin}/api/local-media/jobs/${id}`, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      "x-hermest-local-media": "1",
      origin
    }
  });
}

function getJob(origin, id) {
  return fetch(`${origin}/api/local-media/jobs/${id}`, { headers: { origin } });
}

test("DELETE render cancel answers 202 cancelled and stays idempotent on repeat", async t => {
  const started = deferred();
  const manager = createLocalMediaJobManager({
    executeRender: ({ signal }) => new Promise((_resolve, reject) => {
      started.resolve();
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })
  });
  const origin = await startServer(t, manager);
  const submitted = manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await started.promise;

  const first = await cancelJob(origin, submitted.id);
  assert.equal(first.status, 202);
  const firstBody = await first.json();
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.job.id, submitted.id);
  assert.equal(firstBody.job.status, "cancelled");

  const repeat = await cancelJob(origin, submitted.id);
  assert.equal(repeat.status, 202);
  const repeatBody = await repeat.json();
  assert.equal(repeatBody.ok, true);
  assert.equal(repeatBody.job.status, "cancelled");

  const polled = await getJob(origin, submitted.id);
  assert.equal(polled.status, 200);
  assert.equal((await polled.json()).job.status, "cancelled");
});

test("DELETE render cancel of an unknown job answers 404 with the error envelope", async t => {
  const manager = createLocalMediaJobManager({ executeRender: async () => ({}) });
  const origin = await startServer(t, manager);

  const response = await cancelJob(origin, "job_does-not-exist");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "local_media_job_not_found",
    code: "local_media_job_not_found"
  });

  // Middleware пережил отказ и продолжает обслуживать запросы.
  const status = await fetch(`${origin}/api/local-media/status`, { headers: { origin } });
  assert.equal(status.status, 200);
});

test("DELETE render cancel of terminal jobs answers a deterministic 409", async t => {
  const manager = createLocalMediaJobManager({
    executeRender: async ({ project }) => {
      if (project.title === "fail") throw new Error("render exploded");
      return {
        outputDir: "/tmp/private-terminal-http",
        manifestPath: "/tmp/private-terminal-http/master.manifest.json",
        manifestHashPath: "/tmp/private-terminal-http/master.manifest.json.sha256",
        manifest: { recipe: { id: "youtube-16x9-1080p" }, qc: { passed: true }, blockers: [], warnings: [], artifacts: [] }
      };
    }
  });
  const origin = await startServer(t, manager);

  const completed = manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await manager.waitFor(completed.id);
  const completedResponse = await cancelJob(origin, completed.id);
  assert.equal(completedResponse.status, 409);
  assert.deepEqual(await completedResponse.json(), {
    ok: false,
    error: "local_media_job_not_cancellable",
    code: "local_media_job_not_cancellable"
  });

  const failed = manager.submit({
    project: { title: "fail", cards: [{ id: "scene", text: "Renderable scene" }] },
    platform: "youtube_video"
  });
  await manager.waitFor(failed.id);
  const failedResponse = await cancelJob(origin, failed.id);
  assert.equal(failedResponse.status, 409);
  assert.equal((await failedResponse.json()).code, "local_media_job_not_cancellable");

  // Терминальные job не изменились после попыток отмены.
  assert.equal(manager.get(completed.id).status, "completed");
  assert.equal(manager.get(failed.id).status, "failed");
});

test("late render result after HTTP cancel never resurrects the job", async t => {
  const gate = deferred();
  const started = deferred();
  const manager = createLocalMediaJobManager({
    // executeRender игнорирует signal: модель child-процесса, чей результат
    // физически дозрел уже после отмены. Job обязан остаться cancelled.
    executeRender: () => {
      started.resolve();
      return gate.promise;
    }
  });
  const origin = await startServer(t, manager);
  const submitted = manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await started.promise;

  const cancelled = await cancelJob(origin, submitted.id);
  assert.equal(cancelled.status, 202);
  assert.equal((await cancelled.json()).job.status, "cancelled");

  gate.resolve({
    outputDir: "/tmp/private-late-http",
    manifestPath: "/tmp/private-late-http/master.manifest.json",
    manifestHashPath: "/tmp/private-late-http/master.manifest.json.sha256",
    manifest: {
      recipe: { id: "youtube-16x9-1080p" },
      qc: { passed: true },
      blockers: [],
      warnings: [],
      artifacts: [{ name: "master.mp4", type: "video/mp4", bytes: 10, sha256: "a".repeat(64) }]
    }
  });
  await manager.waitFor(submitted.id);

  const polled = await getJob(origin, submitted.id);
  assert.equal(polled.status, 200);
  const body = await polled.json();
  assert.equal(body.job.status, "cancelled");
  assert.deepEqual(body.job.artifacts, []);
});

test("DELETE render cancel guards mutation header and malformed ids without 500", async t => {
  const manager = createLocalMediaJobManager({ executeRender: async () => ({}) });
  const origin = await startServer(t, manager);

  // Без mutation-header отмена запрещена — контракт mutation-роутов.
  const unauthorized = await fetch(`${origin}/api/local-media/jobs/job_x`, {
    method: "DELETE",
    headers: { origin, "content-type": "application/json" }
  });
  assert.equal(unauthorized.status, 403);

  // Id вне схемы job_[A-Za-z0-9-]+ — чистый 404, не 500.
  const malformed = await fetch(`${origin}/api/local-media/jobs/draft_wrong-prefix`, {
    method: "DELETE",
    headers: { origin, "content-type": "application/json", "x-hermest-local-media": "1" }
  });
  assert.equal(malformed.status, 404);
  const malformedBody = await malformed.json();
  assert.equal(malformedBody.ok, false);
  assert.equal(typeof malformedBody.code, "string");
  assert.equal(JSON.stringify(malformedBody).includes("/home/"), false);

  // Middleware жив после обоих отказов.
  const status = await fetch(`${origin}/api/local-media/status`, { headers: { origin } });
  assert.equal(status.status, 200);
});

test("a manager violating the cancel outcome contract yields 500, not a crash", async t => {
  const brokenManager = {
    submit() { throw new Error("unused"); },
    get() { return null; },
    cancel() { return { outcome: "???" }; },
    waitFor() { return Promise.resolve(null); },
    resolveArtifact() { throw new RangeError("unused"); }
  };
  const origin = await startServer(t, brokenManager);

  const response = await cancelJob(origin, "job_broken");
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "local_media_cancel_failed");

  // Middleware пережил нарушение контракта менеджером.
  const status = await fetch(`${origin}/api/local-media/status`, { headers: { origin } });
  assert.equal(status.status, 200);
});
