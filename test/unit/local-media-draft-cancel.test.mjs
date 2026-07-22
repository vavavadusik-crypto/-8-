// HTTP-контракт отмены draft-job (docs/CANCEL_MILESTONE_HANDOFF.md):
// 202 идемпотентно для queued/running и повторной отмены,
// 404 draft_job_not_found для неизвестного id,
// 409 draft_job_not_cancellable для терминальных completed/failed,
// поздний результат worker'а никогда не воскрешает отменённый job,
// и ни один из этих путей не роняет middleware и не отвечает 500.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createDraftJobManager } from "../../src/local-media/draft-job-manager.js";
import { createLocalMediaJobManager } from "../../src/local-media/job-manager.js";
import { createLocalMediaRequestHandler } from "../../src/local-media/vite-plugin.js";

const MAX_POLL_ATTEMPTS = 50;

async function startServer(t, draftManager) {
  const manager = createLocalMediaJobManager({ executeRender: async () => ({}) });
  const server = createServer(createLocalMediaRequestHandler({ manager, draftManager }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));
  return origin;
}

function cancelDraft(origin, id) {
  return fetch(`${origin}/api/local-media/draft/${id}`, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      "x-hermest-local-media": "1",
      origin
    }
  });
}

function getDraft(origin, id) {
  return fetch(`${origin}/api/local-media/draft/${id}`, { headers: { origin } });
}

async function waitForManagerStatus(manager, id, statuses) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const job = manager.get(id);
    if (job && statuses.includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`draft job never reached ${statuses.join("/")}`);
}

test("DELETE draft cancel answers 202 cancelled and stays idempotent on repeat", async t => {
  const draftManager = createDraftJobManager({
    runDraft: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })
  });
  const origin = await startServer(t, draftManager);
  const submitted = draftManager.submit({ topic: "Длинная тема" });

  const first = await cancelDraft(origin, submitted.id);
  assert.equal(first.status, 202);
  const firstBody = await first.json();
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.job.id, submitted.id);
  assert.equal(firstBody.job.status, "cancelled");

  const repeat = await cancelDraft(origin, submitted.id);
  assert.equal(repeat.status, 202);
  const repeatBody = await repeat.json();
  assert.equal(repeatBody.ok, true);
  assert.equal(repeatBody.job.status, "cancelled");

  const polled = await getDraft(origin, submitted.id);
  assert.equal(polled.status, 200);
  assert.equal((await polled.json()).job.status, "cancelled");
});

test("DELETE draft cancel of an unknown job answers 404 with the error envelope", async t => {
  const draftManager = createDraftJobManager({ runDraft: async () => ({ board: {} }) });
  const origin = await startServer(t, draftManager);

  const response = await cancelDraft(origin, "draft_does-not-exist");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "draft_job_not_found",
    code: "draft_job_not_found"
  });

  // Middleware пережил отказ и продолжает обслуживать запросы.
  const status = await fetch(`${origin}/api/local-media/status`, { headers: { origin } });
  assert.equal(status.status, 200);
});

test("DELETE draft cancel of terminal jobs answers a deterministic 409", async t => {
  const draftManager = createDraftJobManager({
    runDraft: async ({ topic }) => {
      if (topic === "fail") throw new Error("model exploded");
      return { board: { title: topic } };
    }
  });
  const origin = await startServer(t, draftManager);

  const completed = draftManager.submit({ topic: "Готовый борд" });
  await waitForManagerStatus(draftManager, completed.id, ["completed"]);
  const completedResponse = await cancelDraft(origin, completed.id);
  assert.equal(completedResponse.status, 409);
  assert.deepEqual(await completedResponse.json(), {
    ok: false,
    error: "draft_job_not_cancellable",
    code: "draft_job_not_cancellable"
  });

  const failed = draftManager.submit({ topic: "fail" });
  await waitForManagerStatus(draftManager, failed.id, ["failed"]);
  const failedResponse = await cancelDraft(origin, failed.id);
  assert.equal(failedResponse.status, 409);
  assert.equal((await failedResponse.json()).code, "draft_job_not_cancellable");

  // Терминальный job не изменился после попытки отмены.
  assert.equal(draftManager.get(completed.id).status, "completed");
  assert.equal(draftManager.get(failed.id).status, "failed");
});

test("late worker result after HTTP cancel never resurrects the job", async t => {
  let resolveRun;
  const draftManager = createDraftJobManager({
    // runDraft игнорирует signal: модель upstream-HTTP, который нельзя
    // прервать. Отмена всё равно терминальна, поздний борд отброшен.
    runDraft: () => new Promise(resolve => { resolveRun = resolve; })
  });
  const origin = await startServer(t, draftManager);
  const submitted = draftManager.submit({ topic: "Гонка" });

  const cancelled = await cancelDraft(origin, submitted.id);
  assert.equal(cancelled.status, 202);
  assert.equal((await cancelled.json()).job.status, "cancelled");

  resolveRun({ board: { title: "Поздний борд" }, warnings: ["late"] });
  await new Promise(resolve => setTimeout(resolve, 0));

  const polled = await getDraft(origin, submitted.id);
  assert.equal(polled.status, 200);
  const body = await polled.json();
  assert.equal(body.job.status, "cancelled");
  assert.equal(body.job.board, null);
});

test("DELETE draft cancel guards mutation header and malformed ids without 500", async t => {
  const draftManager = createDraftJobManager({ runDraft: async () => ({ board: {} }) });
  const origin = await startServer(t, draftManager);

  // Без mutation-header отмена запрещена — контракт mutation-роутов.
  const unauthorized = await fetch(`${origin}/api/local-media/draft/draft_x`, {
    method: "DELETE",
    headers: { origin, "content-type": "application/json" }
  });
  assert.equal(unauthorized.status, 403);

  // Id вне схемы draft_[A-Za-z0-9-]+ — чистый 404, не 500.
  const malformed = await fetch(`${origin}/api/local-media/draft/job_wrong-prefix`, {
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
