// Resume-контракт (docs/RESUME_MILESTONE_HANDOFF.md): активная генерация
// переживает «отключение» отправителя (reload вкладки) — job живёт в памяти
// до терминала+TTL и опрашивается по id свежим GET без mutation-header;
// createdAt (ISO) отдаётся для восстановления elapsed; неизвестный или
// вычищенный id → структурная 404 {error, code} без утечки внутренностей.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createDraftJobManager } from "../../src/local-media/draft-job-manager.js";
import { createLocalMediaJobManager } from "../../src/local-media/job-manager.js";
import { createLocalMediaRequestHandler } from "../../src/local-media/vite-plugin.js";

const MAX_POLL_ATTEMPTS = 50;

async function startServer(t, { manager, draftManager }) {
  const server = createServer(createLocalMediaRequestHandler({ manager, draftManager }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));
  return origin;
}

function postJson(origin, pathname, body) {
  return fetch(`${origin}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hermest-local-media": "1",
      origin
    },
    body: JSON.stringify(body)
  });
}

// Свежий GET без mutation-header — то, что делает страница после reload.
function getJson(origin, pathname) {
  return fetch(`${origin}${pathname}`, { headers: { origin } });
}

async function waitForManagerStatus(manager, id, statuses) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const job = manager.get(id);
    if (job && statuses.includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`job never reached ${statuses.join("/")}`);
}

test("draft job survives sender disconnect and is re-pollable by id with createdAt", async t => {
  let resolveRun;
  const draftManager = createDraftJobManager({
    runDraft: () => new Promise(resolve => { resolveRun = resolve; })
  });
  const manager = createLocalMediaJobManager({ executeRender: async () => ({}) });
  const origin = await startServer(t, { manager, draftManager });

  const submitResponse = await postJson(origin, "/api/local-media/draft", { topic: "Resume topic" });
  assert.equal(submitResponse.status, 202);
  const submitted = (await submitResponse.json()).job;
  assert.match(submitted.id, /^draft_/);
  assert.ok(Number.isFinite(Date.parse(submitted.createdAt)), "submit exposes ISO createdAt");

  // «Отключение»: submit-запрос давно завершён, страница перезагрузилась —
  // независимый GET по сохранённому id видит актуальный активный статус.
  const reconnect = await getJson(origin, `/api/local-media/draft/${submitted.id}`);
  assert.equal(reconnect.status, 200);
  const reconnectBody = await reconnect.json();
  assert.equal(reconnectBody.ok, true);
  assert.ok(["queued", "running"].includes(reconnectBody.job.status));
  assert.equal(reconnectBody.job.createdAt, submitted.createdAt);
  assert.equal(reconnectBody.job.board, null);

  resolveRun({ board: { title: "Resumed board" } });
  await waitForManagerStatus(draftManager, submitted.id, ["completed"]);

  const finished = await getJson(origin, `/api/local-media/draft/${submitted.id}`);
  assert.equal(finished.status, 200);
  const finishedBody = await finished.json();
  assert.equal(finishedBody.job.status, "completed");
  assert.deepEqual(finishedBody.job.board, { title: "Resumed board" });
  assert.equal(finishedBody.job.createdAt, submitted.createdAt);
});

test("reconnect to an unknown draft job answers the structural 404 envelope", async t => {
  const draftManager = createDraftJobManager({ runDraft: async () => ({ board: {} }) });
  const manager = createLocalMediaJobManager({ executeRender: async () => ({}) });
  const origin = await startServer(t, { manager, draftManager });

  const response = await getJson(origin, "/api/local-media/draft/draft_unknown-after-reload");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "draft_job_not_found",
    code: "draft_job_not_found"
  });
});

test("reconnect to an evicted draft job answers the structural 404 envelope", async t => {
  let clock = Date.parse("2026-07-23T10:00:00.000Z");
  const draftManager = createDraftJobManager({
    runDraft: async () => ({ board: { title: "Old board" } }),
    now: () => new Date(clock).toISOString(),
    ttlMs: 60_000
  });
  const manager = createLocalMediaJobManager({ executeRender: async () => ({}) });
  const origin = await startServer(t, { manager, draftManager });

  const submitted = draftManager.submit({ topic: "Old topic" });
  await waitForManagerStatus(draftManager, submitted.id, ["completed"]);

  // Терминальный job пережил ttl — следующий submit вычищает его.
  clock += 61_000;
  draftManager.submit({ topic: "Sweep" });

  const response = await getJson(origin, `/api/local-media/draft/${submitted.id}`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "draft_job_not_found",
    code: "draft_job_not_found"
  });
});

test("render job survives sender disconnect and is re-pollable by id with createdAt", async t => {
  let resolveRender;
  const manager = createLocalMediaJobManager({
    executeRender: () => new Promise(resolve => { resolveRender = resolve; })
  });
  const draftManager = createDraftJobManager({ runDraft: async () => ({ board: {} }) });
  const origin = await startServer(t, { manager, draftManager });

  const submitResponse = await postJson(origin, "/api/local-media/render", {
    project: { title: "Resume", cards: [{ id: "scene", text: "Renderable scene" }] },
    platform: "youtube_video"
  });
  assert.equal(submitResponse.status, 202);
  const submitted = (await submitResponse.json()).job;
  assert.match(submitted.id, /^job_/);
  assert.ok(Number.isFinite(Date.parse(submitted.createdAt)), "submit exposes ISO createdAt");

  const reconnect = await getJson(origin, `/api/local-media/jobs/${submitted.id}`);
  assert.equal(reconnect.status, 200);
  const reconnectBody = await reconnect.json();
  assert.equal(reconnectBody.ok, true);
  assert.ok(["queued", "running"].includes(reconnectBody.job.status));
  assert.equal(reconnectBody.job.createdAt, submitted.createdAt);

  resolveRender({
    outputDir: "/tmp/private-resume-run",
    manifestPath: "/tmp/private-resume-run/master.manifest.json",
    manifestHashPath: "/tmp/private-resume-run/master.manifest.json.sha256",
    manifest: {
      recipe: { id: "youtube-16x9-1080p" },
      qc: { passed: true },
      blockers: [],
      warnings: [],
      artifacts: []
    }
  });
  await manager.waitFor(submitted.id);

  const finished = await getJson(origin, `/api/local-media/jobs/${submitted.id}`);
  assert.equal(finished.status, 200);
  const finishedBody = await finished.json();
  assert.equal(finishedBody.job.status, "completed");
  assert.equal(finishedBody.job.createdAt, submitted.createdAt);
  assert.ok(Array.isArray(finishedBody.job.artifacts));
});

test("reconnect to an unknown render job answers the structural 404 envelope", async t => {
  const manager = createLocalMediaJobManager({ executeRender: async () => ({}) });
  const draftManager = createDraftJobManager({ runDraft: async () => ({ board: {} }) });
  const origin = await startServer(t, { manager, draftManager });

  const response = await getJson(origin, "/api/local-media/jobs/job_unknown-after-reload");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "local_media_job_not_found",
    code: "local_media_job_not_found"
  });
});
