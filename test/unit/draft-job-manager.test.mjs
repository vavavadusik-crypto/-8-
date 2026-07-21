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
  assert.equal(manager.cancel(submitted.id), true);
  const cancelled = await waitForStatus(manager, submitted.id, ["cancelled"]);
  assert.equal(cancelled.board, null);
  assert.equal(cancelled.error, null);
  assert.equal(manager.cancel(submitted.id), false);
});

test("draft job manager rejects an empty topic and unknown ids", () => {
  const manager = createDraftJobManager({ runDraft: async () => ({ board: {} }) });
  assert.throws(() => manager.submit({ topic: "   " }), TypeError);
  assert.throws(() => manager.submit({}), TypeError);
  assert.equal(manager.get("draft_missing"), null);
  assert.equal(manager.cancel("draft_missing"), false);
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
