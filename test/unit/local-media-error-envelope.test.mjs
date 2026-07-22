import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createDraftJobManager } from "../../src/local-media/draft-job-manager.js";
import { createLocalMediaJobManager } from "../../src/local-media/job-manager.js";
import { createLocalMediaRequestHandler, publicError } from "../../src/local-media/vite-plugin.js";

const VALID_PROJECT = { schemaVersion: 1, title: "Local", cards: [{ id: "one", text: "Scene" }] };

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

function mutationHeaders(origin) {
  return { origin, "content-type": "application/json", "x-hermest-local-media": "1" };
}

async function expectEnvelope(response, status, code) {
  assert.equal(response.status, status);
  assert.match(String(response.headers.get("content-type")), /application\/json/);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, code, `expected code ${code}, got ${JSON.stringify(body)}`);
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0 && body.error.length <= 300);
  return body;
}

test("unknown draft and render jobs return a structured 404 envelope", async t => {
  const origin = await startHandler(t, { manager: idleManager() });

  await expectEnvelope(
    await fetch(`${origin}/api/local-media/draft/draft_missing`, { headers: { origin } }),
    404,
    "draft_job_not_found"
  );
  await expectEnvelope(
    await fetch(`${origin}/api/local-media/jobs/job_missing`, { headers: { origin } }),
    404,
    "local_media_job_not_found"
  );
  await expectEnvelope(
    await fetch(`${origin}/api/local-media/no-such-route`, { headers: { origin } }),
    404,
    "not_found"
  );
});

test("malformed input returns structured 400/403/413/415 envelopes", async t => {
  const origin = await startHandler(t, { manager: idleManager(), maxBodyBytes: 256 });

  await expectEnvelope(
    await fetch(`${origin}/api/local-media/draft`, {
      method: "POST",
      headers: mutationHeaders(origin),
      body: "not json at all"
    }),
    400,
    "invalid_local_media_json"
  );
  await expectEnvelope(
    await fetch(`${origin}/api/local-media/draft`, {
      method: "POST",
      headers: mutationHeaders(origin)
    }),
    400,
    "local_media_json_body_required"
  );
  await expectEnvelope(
    await fetch(`${origin}/api/local-media/render`, {
      method: "POST",
      headers: { origin, "content-type": "text/plain", "x-hermest-local-media": "1" },
      body: "{}"
    }),
    415,
    "application_json_required"
  );
  await expectEnvelope(
    await fetch(`${origin}/api/local-media/render`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ project: VALID_PROJECT })
    }),
    403,
    "local_media_mutation_header_required"
  );
  await expectEnvelope(
    await fetch(`${origin}/api/local-media/render`, {
      method: "POST",
      headers: mutationHeaders(origin),
      body: JSON.stringify({ project: { title: "x".repeat(600) } })
    }),
    413,
    "local_media_request_too_large"
  );
});

test("draft capacity overload returns a structured 429 envelope", async t => {
  const draftManager = createDraftJobManager({
    runDraft: () => new Promise(() => {}),
    maxJobs: 1
  });
  const origin = await startHandler(t, { manager: idleManager(), draftManager });

  const accepted = await fetch(`${origin}/api/local-media/draft`, {
    method: "POST",
    headers: mutationHeaders(origin),
    body: JSON.stringify({ topic: "Первая тема" })
  });
  assert.equal(accepted.status, 202);

  await expectEnvelope(
    await fetch(`${origin}/api/local-media/draft`, {
      method: "POST",
      headers: mutationHeaders(origin),
      body: JSON.stringify({ topic: "Вторая тема" })
    }),
    429,
    "draft_jobs_capacity"
  );
});

test("render capacity overload returns a structured 429 envelope", async t => {
  const manager = createLocalMediaJobManager({
    executeRender: () => new Promise(() => {}),
    maxConcurrent: 1,
    maxJobs: 1
  });
  const origin = await startHandler(t, { manager });

  const accepted = await fetch(`${origin}/api/local-media/render`, {
    method: "POST",
    headers: mutationHeaders(origin),
    body: JSON.stringify({ project: VALID_PROJECT, platform: "youtube_video" })
  });
  assert.equal(accepted.status, 202);

  const body = await expectEnvelope(
    await fetch(`${origin}/api/local-media/render`, {
      method: "POST",
      headers: mutationHeaders(origin),
      body: JSON.stringify({ project: VALID_PROJECT, platform: "youtube_video" })
    }),
    429,
    "local_media_jobs_capacity"
  );
  assert.equal(/[\\/]/.test(body.error), false, "capacity error must not carry paths");
});

test("deep project validation failures map to a bounded 400 envelope", async t => {
  const origin = await startHandler(t, { manager: idleManager() });

  const body = await expectEnvelope(
    await fetch(`${origin}/api/local-media/render`, {
      method: "POST",
      headers: mutationHeaders(origin),
      body: JSON.stringify({ project: { schemaVersion: 1, title: "No cards" }, platform: "youtube_video" })
    }),
    400,
    "local_media_invalid_input"
  );
  assert.equal(body.error.includes("\n"), false, "no multi-line traces in error text");
});

test("a vanished artifact file maps to a structured 404, not a 500", async t => {
  const manager = {
    submit() { throw new Error("unused"); },
    get: () => ({
      id: "job_ghost",
      status: "completed",
      artifacts: [{ name: "master.mp4", type: "video/mp4" }]
    }),
    cancel: () => false,
    resolveArtifact: () => "/tmp/hermest-definitely-missing-dir/master.mp4"
  };
  const origin = await startHandler(t, { manager });

  await expectEnvelope(
    await fetch(`${origin}/api/local-media/jobs/job_ghost/artifacts/master.mp4`, { headers: { origin } }),
    404,
    "local_media_artifact_not_found"
  );
});

test("publicError caps the message length after redacting paths", () => {
  const long = publicError(new TypeError(`bad ${"x".repeat(1000)}`), 400);
  assert.ok(long.length <= 300, `message must be capped, got ${long.length}`);
  const mixed = publicError(new TypeError(`fail at /home/user/${"a".repeat(400)} end`), 400);
  assert.equal(mixed.includes("/home"), false);
});
