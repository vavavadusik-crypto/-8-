import assert from "node:assert/strict";
import test from "node:test";

import { createDraftJobManager } from "../../src/local-media/draft-job-manager.js";

const MAX_POLL_ATTEMPTS = 50;

async function waitForStatus(manager, id, statuses) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const job = manager.get(id);
    if (job && statuses.includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error(`draft job never reached ${statuses.join("/")}`);
}

test("draft job manager requires an executable runDraft", () => {
  assert.throws(() => createDraftJobManager(), TypeError);
  assert.throws(() => createDraftJobManager({ runDraft: "no" }), TypeError);
});

test("draft job completes and exposes the board only when finished", async () => {
  const manager = createDraftJobManager({
    runDraft: async ({ topic }) => ({
      board: { title: topic, cards: [] },
      warnings: ["research failed"]
    })
  });

  const submitted = manager.submit({ topic: "  Solar wind  ", sceneCount: 4 });
  assert.match(submitted.id, /^draft_/);
  assert.ok(["queued", "running"].includes(submitted.status));
  assert.equal(submitted.board, null);

  const finished = await waitForStatus(manager, submitted.id, ["completed"]);
  assert.deepEqual(finished.board, { title: "  Solar wind  ", cards: [] });
  assert.deepEqual(finished.warnings, ["research failed"]);
  assert.equal(finished.error, null);
});

test("draft job failure keeps only the sanitized message", async () => {
  const manager = createDraftJobManager({
    runDraft: async () => {
      throw new Error("text model bridge is not available");
    }
  });

  const submitted = manager.submit({ topic: "Bridge outage" });
  const failed = await waitForStatus(manager, submitted.id, ["failed"]);
  assert.equal(failed.error, "text model bridge is not available");
  assert.equal(failed.board, null);
});

test("draft job failure never leaks stack traces or absolute paths", async () => {
  const manager = createDraftJobManager({
    runDraft: async () => {
      throw new Error("bridge read failed at /home/architect/.secrets/bridge.json");
    }
  });

  const submitted = manager.submit({ topic: "Path leak" });
  const failed = await waitForStatus(manager, submitted.id, ["failed"]);
  assert.equal(failed.error, "bridge read failed at <path>");
  assert.equal(JSON.stringify(failed).includes(".secrets"), false);
});

test("draft job cancellation aborts the running bridge call", async () => {
  const manager = createDraftJobManager({
    runDraft: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })
  });

  const submitted = manager.submit({ topic: "Long reasoning" });
  assert.equal(manager.cancel(submitted.id).outcome, "cancelled");
  const cancelled = await waitForStatus(manager, submitted.id, ["cancelled"]);
  assert.equal(cancelled.board, null);
  assert.equal(cancelled.error, null);
});

test("draft job cancel is immediately terminal without a transient status", () => {
  let resolveRun;
  const manager = createDraftJobManager({
    runDraft: () => new Promise(resolve => { resolveRun = resolve; })
  });

  const submitted = manager.submit({ topic: "Long reasoning" });
  const result = manager.cancel(submitted.id);
  assert.equal(result.outcome, "cancelled");
  assert.equal(result.job.id, submitted.id);
  // Контракт статусов: queued|running|completed|failed|cancelled.
  // Промежуточный "cancelling" наружу не выходит — DELETE и GET сразу
  // видят терминальный cancelled.
  assert.equal(result.job.status, "cancelled");
  assert.equal(manager.get(submitted.id).status, "cancelled");
  resolveRun({ board: {} });
});

test("repeat cancel of a cancelled draft job is idempotent", async () => {
  const manager = createDraftJobManager({
    runDraft: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })
  });

  const submitted = manager.submit({ topic: "Long reasoning" });
  assert.equal(manager.cancel(submitted.id).outcome, "cancelled");
  await waitForStatus(manager, submitted.id, ["cancelled"]);

  const repeated = manager.cancel(submitted.id);
  assert.equal(repeated.outcome, "cancelled");
  assert.equal(repeated.job.status, "cancelled");
  assert.equal(repeated.job.error, null);
});

test("cancel of terminal draft jobs reports not_cancellable", async () => {
  const manager = createDraftJobManager({
    runDraft: async ({ topic }) => {
      if (topic === "fail") throw new Error("model exploded");
      return { board: { title: topic } };
    }
  });

  const completed = manager.submit({ topic: "Done" });
  await waitForStatus(manager, completed.id, ["completed"]);
  const completedResult = manager.cancel(completed.id);
  assert.equal(completedResult.outcome, "not_cancellable");
  assert.equal(completedResult.job.status, "completed");

  const failed = manager.submit({ topic: "fail" });
  await waitForStatus(manager, failed.id, ["failed"]);
  const failedResult = manager.cancel(failed.id);
  assert.equal(failedResult.outcome, "not_cancellable");
  assert.equal(failedResult.job.status, "failed");
});

test("late worker result after cancel is discarded and the job stays cancelled", async () => {
  let resolveRun;
  const manager = createDraftJobManager({
    // Исполнитель игнорирует signal — модель upstream-HTTP, который
    // физически не прервать: job всё равно обязан остаться cancelled.
    runDraft: () => new Promise(resolve => { resolveRun = resolve; })
  });

  const submitted = manager.submit({ topic: "Race" });
  assert.equal(manager.cancel(submitted.id).outcome, "cancelled");

  resolveRun({ board: { title: "Late board" }, warnings: ["late warning"] });
  await new Promise(resolve => setTimeout(resolve, 0));

  const after = manager.get(submitted.id);
  assert.equal(after.status, "cancelled");
  assert.equal(after.board, null);
  assert.deepEqual(after.warnings, []);
  assert.equal(after.error, null);
});

test("late worker failure after cancel keeps cancelled status without a public error", async () => {
  let rejectRun;
  const manager = createDraftJobManager({
    runDraft: () => new Promise((resolve, reject) => { rejectRun = reject; })
  });

  const submitted = manager.submit({ topic: "Race" });
  assert.equal(manager.cancel(submitted.id).outcome, "cancelled");

  rejectRun(new Error("provider blew up at /home/architect/.secrets/key"));
  await new Promise(resolve => setTimeout(resolve, 0));

  const after = manager.get(submitted.id);
  assert.equal(after.status, "cancelled");
  assert.equal(after.error, null);
  assert.equal(JSON.stringify(after).includes(".secrets"), false);
});

test("draft job manager rejects an empty topic and unknown ids", () => {
  const manager = createDraftJobManager({ runDraft: async () => ({ board: {} }) });
  assert.throws(() => manager.submit({ topic: "   " }), TypeError);
  assert.throws(() => manager.submit({}), TypeError);
  assert.equal(manager.get("draft_missing"), null);
  assert.deepEqual(manager.cancel("draft_missing"), { outcome: "not_found", job: null });
});

test("public draft job view never exposes the controller or submitted params", async () => {
  const manager = createDraftJobManager({
    runDraft: async () => ({ board: { title: "Board" } })
  });

  const submitted = manager.submit({ topic: "Secrecy", voice: "ru-female", narrationProvider: "elevenlabs" });
  assert.deepEqual(
    Object.keys(submitted).sort(),
    ["board", "createdAt", "error", "id", "status", "warnings"]
  );

  const finished = await waitForStatus(manager, submitted.id, ["completed"]);
  const serialized = JSON.stringify(finished);
  assert.equal(serialized.includes("elevenlabs"), false);
  assert.equal(serialized.includes("ru-female"), false);
});

test("draft job manager evicts finished jobs past the ttl and at capacity", async () => {
  let clock = Date.parse("2026-07-21T10:00:00.000Z");
  const manager = createDraftJobManager({
    runDraft: async () => ({ board: { title: "Board" } }),
    now: () => new Date(clock).toISOString(),
    ttlMs: 60_000,
    maxJobs: 2
  });

  const first = manager.submit({ topic: "First" });
  await waitForStatus(manager, first.id, ["completed"]);
  clock += 120_000;

  const second = manager.submit({ topic: "Second" });
  assert.equal(manager.get(first.id), null, "expired job is evicted by ttl");
  await waitForStatus(manager, second.id, ["completed"]);

  const third = manager.submit({ topic: "Third" });
  await waitForStatus(manager, third.id, ["completed"]);
  const fourth = manager.submit({ topic: "Fourth" });
  assert.equal(manager.get(second.id), null, "oldest finished job is evicted at capacity");
  assert.ok(manager.get(fourth.id));
});

test("draft job older than ttl survives eviction while running and lives ttl past its terminal transition", async () => {
  let clock = Date.parse("2026-07-23T10:00:00.000Z");
  const gates = new Map();
  const manager = createDraftJobManager({
    runDraft: ({ topic }) => new Promise(resolve => { gates.set(topic, resolve); }),
    now: () => new Date(clock).toISOString(),
    ttlMs: 60_000,
    maxJobs: 8
  });

  const longRunning = manager.submit({ topic: "Long reasoning" });
  await waitForStatus(manager, longRunning.id, ["running"]);

  // Драфт работает втрое дольше ttl: чужие submit гоняют eviction, но активный
  // job не имеет права исчезнуть, пока не станет терминальным.
  clock += 180_000;
  manager.submit({ topic: "Sweep while running" });
  const stillRunning = manager.get(longRunning.id);
  assert.ok(stillRunning, "running job must survive ttl eviction");
  assert.equal(stillRunning.status, "running");

  gates.get("Long reasoning")({ board: { title: "Late board" } });
  await waitForStatus(manager, longRunning.id, ["completed"]);

  // TTL отсчитывается от терминального перехода, а не от создания: фронт после
  // reload обязан успеть забрать результат long-draft'а в течение полного ttl.
  clock += 30_000;
  manager.submit({ topic: "Sweep freshly finished" });
  const freshlyFinished = manager.get(longRunning.id);
  assert.ok(freshlyFinished, "job finished less than ttl ago must stay pollable");
  assert.equal(freshlyFinished.status, "completed");

  clock += 61_000;
  manager.submit({ topic: "Sweep stale" });
  assert.equal(manager.get(longRunning.id), null, "terminal job is evicted after ttl from its finish");
});

test("cancelled draft job lives ttl from cancellation, not from creation", async () => {
  let clock = Date.parse("2026-07-23T10:00:00.000Z");
  const gates = new Map();
  const manager = createDraftJobManager({
    runDraft: ({ topic, signal }) => new Promise((resolve, reject) => {
      gates.set(topic, resolve);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
    now: () => new Date(clock).toISOString(),
    ttlMs: 60_000,
    maxJobs: 8
  });

  const submitted = manager.submit({ topic: "Long reasoning" });
  await waitForStatus(manager, submitted.id, ["running"]);

  clock += 180_000;
  assert.equal(manager.cancel(submitted.id).outcome, "cancelled");

  clock += 30_000;
  manager.submit({ topic: "Sweep freshly cancelled" });
  const freshlyCancelled = manager.get(submitted.id);
  assert.ok(freshlyCancelled, "job cancelled less than ttl ago must stay pollable");
  assert.equal(freshlyCancelled.status, "cancelled");

  clock += 61_000;
  manager.submit({ topic: "Sweep stale" });
  assert.equal(manager.get(submitted.id), null, "cancelled job is evicted after ttl from cancellation");
});

test("draft job manager refuses to queue past capacity while jobs are running", () => {
  const manager = createDraftJobManager({
    runDraft: ({ signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
    maxJobs: 1
  });

  manager.submit({ topic: "Busy" });
  assert.throws(() => manager.submit({ topic: "Rejected" }), error => {
    assert.equal(error.message, "draft_jobs_capacity");
    assert.equal(error.statusCode, 429);
    return true;
  });
});
