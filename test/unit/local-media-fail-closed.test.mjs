import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalMediaJobManager } from "../../src/local-media/job-manager.js";
import { createLocalMediaRequestHandler } from "../../src/local-media/vite-plugin.js";

async function startHandler(t, options) {
  const server = createServer(createLocalMediaRequestHandler(options));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));
  return origin;
}

function idleManager() {
  return createLocalMediaJobManager({ executeRender: async () => ({}) });
}

async function expectAlive(origin) {
  const status = await fetch(`${origin}/api/local-media/status`, { headers: { origin } });
  assert.equal(status.status, 200, "middleware must keep serving after the failure");
}

test("bridge provider failure returns a structured 503 without leaking its message", async t => {
  const origin = await startHandler(t, {
    manager: idleManager(),
    describeBridge: async () => {
      throw new Error("ECONNREFUSED /home/architect/.secrets/bridge with key sk-abc123");
    }
  });

  const response = await fetch(`${origin}/api/local-media/bridge`, { headers: { origin } });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: false,
    error: "bridge_status_unavailable",
    code: "bridge_status_unavailable"
  });
  const raw = JSON.stringify(body);
  assert.equal(raw.includes("/home"), false);
  assert.equal(raw.includes("sk-abc123"), false);

  await expectAlive(origin);
});

test("a draft worker that throws synchronously yields sanitized 500 JSON, not a crash", async t => {
  const origin = await startHandler(t, {
    manager: idleManager(),
    draftManager: {
      submit() { throw new Error("worker exploded at /home/architect/private/draft-worker.js:42"); },
      get: () => null,
      cancel: () => false
    }
  });

  const response = await fetch(`${origin}/api/local-media/draft`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-hermest-local-media": "1" },
    body: JSON.stringify({ topic: "Валидная тема" })
  });
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error, "local_media_internal_error");
  assert.equal(body.code, "local_media_internal_error");
  assert.equal(JSON.stringify(body).includes("/home"), false);

  await expectAlive(origin);
});

test("an unreadable artifact file fails closed as JSON instead of crashing the stream", async t => {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    t.skip("root ignores file permission bits");
    return;
  }
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "hermest-fail-closed-"));
  const artifactPath = path.join(outputDir, "master.mp4");
  await writeFile(artifactPath, "video-bytes", { mode: 0o600 });
  await chmod(artifactPath, 0o000);
  t.after(() => rm(outputDir, { recursive: true, force: true }));

  const manager = {
    submit() { throw new Error("unused"); },
    get: () => ({
      id: "job_locked",
      status: "completed",
      artifacts: [{ name: "master.mp4", type: "video/mp4" }]
    }),
    cancel: () => false,
    resolveArtifact: () => artifactPath
  };
  const origin = await startHandler(t, { manager });

  const response = await fetch(`${origin}/api/local-media/jobs/job_locked/artifacts/master.mp4`, {
    headers: { origin }
  });
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "local_media_artifact_read_failed");
  assert.equal(JSON.stringify(body).includes(outputDir), false);

  await expectAlive(origin);
});
