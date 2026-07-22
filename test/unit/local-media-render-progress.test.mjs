import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createLocalMediaJobManager } from "../../src/local-media/job-manager.js";
import { createLocalMediaRequestHandler } from "../../src/local-media/vite-plugin.js";
import { renderProject } from "../../src/media/render-project.js";

const RENDER_PROJECT = {
  title: "Progress",
  cards: [{ id: "scene", text: "Renderable scene" }]
};

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

function completedRenderResult() {
  return {
    outputDir: "/tmp/private-progress-run",
    manifestPath: "/tmp/private-progress-run/master.manifest.json",
    manifestHashPath: "/tmp/private-progress-run/master.manifest.json.sha256",
    manifest: {
      recipe: { id: "youtube-16x9-1080p" },
      qc: { passed: true },
      blockers: [],
      warnings: [],
      artifacts: [{ name: "master.mp4", type: "video/mp4", bytes: 10, sha256: "a".repeat(64) }]
    }
  };
}

// Мок-адаптер: отдаёт наружу onProgress и gate, чтобы тест сам управлял
// фазами без реального ffmpeg/chrome.
function createMockRenderHarness(overrides = {}) {
  const gate = deferred();
  const started = deferred();
  let reportProgress = null;
  const manager = createLocalMediaJobManager({
    executeRender: ({ onProgress }) => {
      reportProgress = onProgress;
      started.resolve();
      return gate.promise;
    },
    ...overrides
  });
  return {
    manager,
    gate,
    started,
    report: update => reportProgress(update)
  };
}

test("submitted render job exposes queued progress before the adapter reports", async () => {
  const harness = createMockRenderHarness();
  const job = harness.manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await harness.started.promise;

  assert.deepEqual(harness.manager.get(job.id).progress, { phase: "queued" });

  harness.gate.resolve(completedRenderResult());
  await harness.manager.waitFor(job.id);
});

test("render job records injected progress transitions and finishes as done", async () => {
  const harness = createMockRenderHarness();
  const job = harness.manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await harness.started.promise;

  harness.report({ phase: "preflight", label: "Подготовка проекта" });
  assert.deepEqual(harness.manager.get(job.id).progress, {
    phase: "preflight",
    label: "Подготовка проекта"
  });

  harness.report({ phase: "scenes", sceneIndex: 0, sceneTotal: 3, label: "Сцена 1 из 3" });
  assert.deepEqual(harness.manager.get(job.id).progress, {
    phase: "scenes",
    sceneIndex: 0,
    sceneTotal: 3,
    label: "Сцена 1 из 3"
  });

  harness.report({ phase: "scenes", sceneIndex: 2, sceneTotal: 3, label: "Сцена 3 из 3" });
  assert.equal(harness.manager.get(job.id).progress.sceneIndex, 2);

  for (const phase of ["audio", "encode", "finalize"]) {
    harness.report({ phase });
    assert.deepEqual(harness.manager.get(job.id).progress, { phase });
  }

  harness.gate.resolve(completedRenderResult());
  const settled = await harness.manager.waitFor(job.id);
  assert.equal(settled.status, "completed");
  assert.deepEqual(settled.progress, { phase: "done" });
  assert.deepEqual(harness.manager.get(job.id).progress, { phase: "done" });
});

test("progress labels are sanitized: no absolute paths, no control chars, bounded length", async () => {
  const harness = createMockRenderHarness();
  const job = harness.manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await harness.started.promise;

  harness.report({
    phase: "encode",
    label: "encoding /tmp/private-progress-run/секрет.mp4 and C:\\Users\\dev\\secret.mp4\nEvil: at Object.<anonymous>"
  });
  const redacted = harness.manager.get(job.id).progress.label;
  assert.equal(redacted.includes("/tmp/"), false);
  assert.equal(redacted.includes("секрет"), false);
  assert.equal(redacted.includes("C:\\"), false);
  assert.equal(redacted.includes("\n"), false);
  assert.ok(redacted.includes("<path>"));

  harness.report({ phase: "encode", label: `x${"y".repeat(500)}` });
  assert.ok(harness.manager.get(job.id).progress.label.length <= 120);

  // Нестроковый label просто опускается, фаза сохраняется.
  harness.report({ phase: "finalize", label: { evil: true } });
  assert.deepEqual(harness.manager.get(job.id).progress, { phase: "finalize" });

  harness.gate.resolve(completedRenderResult());
  await harness.manager.waitFor(job.id);
});

test("scene counters are validated and only attached to the scenes phase", async () => {
  const harness = createMockRenderHarness();
  const job = harness.manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await harness.started.promise;

  for (const [sceneIndex, sceneTotal] of [[-1, 3], [1.5, 3], [5, 3], ["2", 3], [2, 0]]) {
    harness.report({ phase: "scenes", sceneIndex, sceneTotal });
    assert.deepEqual(harness.manager.get(job.id).progress, { phase: "scenes" });
  }

  // Счётчики сцен вне фазы scenes не публикуются.
  harness.report({ phase: "audio", sceneIndex: 2, sceneTotal: 6 });
  assert.deepEqual(harness.manager.get(job.id).progress, { phase: "audio" });

  harness.gate.resolve(completedRenderResult());
  await harness.manager.waitFor(job.id);
});

test("unknown phases and adapter-claimed done/queued are ignored", async () => {
  const harness = createMockRenderHarness();
  const job = harness.manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await harness.started.promise;

  harness.report({ phase: "preflight" });
  for (const phase of ["hacked", "done", "queued", 42, null, undefined]) {
    harness.report({ phase });
    assert.deepEqual(harness.manager.get(job.id).progress, { phase: "preflight" });
  }
  harness.report(null);
  harness.report("scenes");
  assert.deepEqual(harness.manager.get(job.id).progress, { phase: "preflight" });

  harness.gate.resolve(completedRenderResult());
  await harness.manager.waitFor(job.id);
});

test("cancelled render job freezes progress at the last real phase and never shows done", async () => {
  const harness = createMockRenderHarness();
  const job = harness.manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await harness.started.promise;

  harness.report({ phase: "scenes", sceneIndex: 1, sceneTotal: 3 });
  assert.equal(harness.manager.cancel(job.id).outcome, "cancelled");

  // Поздние отчёты зомби-исполнителя после отмены игнорируются.
  harness.report({ phase: "encode" });
  assert.deepEqual(harness.manager.get(job.id).progress, {
    phase: "scenes",
    sceneIndex: 1,
    sceneTotal: 3
  });

  // Поздний успех отброшен: статус cancelled, прогресс не становится done.
  harness.gate.resolve(completedRenderResult());
  const settled = await harness.manager.waitFor(job.id);
  assert.equal(settled.status, "cancelled");
  assert.notEqual(settled.progress.phase, "done");
  assert.deepEqual(harness.manager.get(job.id).progress, {
    phase: "scenes",
    sceneIndex: 1,
    sceneTotal: 3
  });
});

test("failed render job keeps the last reported phase and never shows done", async () => {
  let reportProgress = null;
  const started = deferred();
  const gate = deferred();
  const manager = createLocalMediaJobManager({
    executeRender: ({ onProgress }) => {
      reportProgress = onProgress;
      started.resolve();
      return gate.promise.then(() => { throw new Error("render exploded at /tmp/secret"); });
    }
  });
  const job = manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await started.promise;

  reportProgress({ phase: "encode" });
  gate.resolve();
  const settled = await manager.waitFor(job.id);

  assert.equal(settled.status, "failed");
  assert.deepEqual(settled.progress, { phase: "encode" });
  assert.equal(settled.error.includes("/tmp"), false);
});

test("cancelled queued render job keeps queued progress", async () => {
  const gate = deferred();
  const manager = createLocalMediaJobManager({
    maxConcurrent: 1,
    executeRender: () => gate.promise
  });
  manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  const queued = manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await Promise.resolve();

  assert.equal(manager.cancel(queued.id).outcome, "cancelled");
  const settled = await manager.waitFor(queued.id);
  assert.equal(settled.status, "cancelled");
  assert.deepEqual(settled.progress, { phase: "queued" });

  gate.resolve(completedRenderResult());
});

test("GET /api/local-media/jobs/:id returns the progress field additively", async t => {
  const harness = createMockRenderHarness();
  const server = createServer(createLocalMediaRequestHandler({ manager: harness.manager }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));

  const job = harness.manager.submit({ project: RENDER_PROJECT, platform: "youtube_video" });
  await harness.started.promise;
  harness.report({ phase: "scenes", sceneIndex: 2, sceneTotal: 6, label: "Сцена 3 из 6" });

  const runningResponse = await fetch(`${origin}/api/local-media/jobs/${job.id}`, { headers: { origin } });
  assert.equal(runningResponse.status, 200);
  const running = await runningResponse.json();
  assert.equal(running.job.status, "running");
  assert.deepEqual(running.job.progress, {
    phase: "scenes",
    sceneIndex: 2,
    sceneTotal: 6,
    label: "Сцена 3 из 6"
  });

  harness.gate.resolve(completedRenderResult());
  await harness.manager.waitFor(job.id);
  const doneResponse = await fetch(`${origin}/api/local-media/jobs/${job.id}`, { headers: { origin } });
  const done = await doneResponse.json();
  assert.equal(done.job.status, "completed");
  assert.deepEqual(done.job.progress, { phase: "done" });
  assert.equal(JSON.stringify(done.job).includes("/tmp/"), false);
});

test("renderProject reports preflight before rejecting invalid input", async () => {
  const events = [];

  // Проект без cards падает в preflight-валидации ДО каких-либо media-инструментов.
  await assert.rejects(
    () => renderProject({
      project: { title: "no cards" },
      outputDir: "/tmp",
      onProgress: update => events.push(update)
    })
  );

  assert.ok(events.length >= 1);
  assert.equal(events[0].phase, "preflight");
});

test("renderProject survives a throwing progress reporter", async () => {
  await assert.rejects(
    () => renderProject({
      project: { title: "no cards" },
      outputDir: "/tmp",
      onProgress: () => { throw new Error("reporter exploded"); }
    }),
    // Рендер падает по своей валидации, а не по ошибке reporter'а.
    error => !/reporter exploded/.test(String(error?.message))
  );
});
