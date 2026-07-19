import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createLocalMediaJobManager } from "../../src/local-media/job-manager.js";
import { createLocalMediaRequestHandler, publicError } from "../../src/local-media/vite-plugin.js";

test("publicError fully redacts Windows and Unicode POSIX absolute paths", () => {
  const message = "cannot read C:\\Users\\architect\\secret.txt or /home/архив/файл.mp4";
  const redacted = publicError(new TypeError(message), 400);
  assert.equal(redacted, "cannot read <path> or <path>");
  assert.equal(redacted.includes("secret.txt"), false);
  assert.equal(redacted.includes("файл.mp4"), false);
  assert.equal(redacted.includes("C:\\"), false);
});

test("local media HTTP boundary queues jobs and serves only allowlisted artifacts", async t => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "hermest-local-http-artifacts-"));
  const videoFile = path.join(outputDir, "master.mp4");
  const manifestPath = path.join(outputDir, "master.manifest.json");
  const manifestHashPath = `${manifestPath}.sha256`;
  await writeFile(videoFile, "video-bytes", { mode: 0o600 });
  await writeFile(manifestPath, "{}\n", { mode: 0o600 });
  await writeFile(manifestHashPath, "hash  master.manifest.json\n", { mode: 0o600 });

  const manager = createLocalMediaJobManager({
    executeRender: async () => ({
      outputDir,
      manifestPath,
      manifestHashPath,
      manifest: {
        recipe: { id: "youtube-16x9-1080p" },
        qc: { passed: true },
        blockers: [],
        warnings: [],
        artifacts: [{
          name: "master.mp4",
          type: "video/mp4",
          bytes: 11,
          sha256: "a".repeat(64)
        }]
      }
    })
  });
  const server = createServer(createLocalMediaRequestHandler({ manager }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(outputDir, { recursive: true, force: true });
  });

  const statusResponse = await fetch(`${origin}/api/local-media/status`, {
    headers: { origin }
  });
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).mode, "local_only");

  const rejectedOrigin = await fetch(`${origin}/api/local-media/status`, {
    headers: { origin: "https://evil.example" }
  });
  assert.equal(rejectedOrigin.status, 403);

  const rejectedMutation = await fetch(`${origin}/api/local-media/render`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ project: { title: "Blocked" }, platform: "youtube_video" })
  });
  assert.equal(rejectedMutation.status, 403);

  const queuedResponse = await fetch(`${origin}/api/local-media/render`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hermest-local-media": "1",
      origin
    },
    body: JSON.stringify({
      project: { schemaVersion: 1, title: "Local", cards: [{ id: "one", text: "Scene" }] },
      platform: "youtube_video"
    })
  });
  assert.equal(queuedResponse.status, 202);
  const queued = await queuedResponse.json();
  assert.match(queued.job.id, /^job_/);

  await manager.waitFor(queued.job.id);
  const jobResponse = await fetch(`${origin}/api/local-media/jobs/${queued.job.id}`, {
    headers: { origin }
  });
  assert.equal(jobResponse.status, 200);
  const { job } = await jobResponse.json();
  assert.equal(job.status, "completed");
  assert.equal(JSON.stringify(job).includes(outputDir), false);
  const video = job.artifacts.find(artifact => artifact.name === "master.mp4");
  assert.equal(video.url, `/api/local-media/jobs/${job.id}/artifacts/master.mp4`);

  const artifactResponse = await fetch(`${origin}${video.url}`, { headers: { origin } });
  assert.equal(artifactResponse.status, 200);
  assert.equal(artifactResponse.headers.get("content-type"), "video/mp4");
  assert.equal(await artifactResponse.text(), "video-bytes");

  const traversalResponse = await fetch(
    `${origin}/api/local-media/jobs/${job.id}/artifacts/%2e%2e%2fsecret`,
    { headers: { origin } }
  );
  assert.ok([400, 404].includes(traversalResponse.status));
});

test("local media HTTP boundary rejects oversized JSON bodies", async t => {
  const manager = createLocalMediaJobManager({ executeRender: async () => ({}) });
  const server = createServer(createLocalMediaRequestHandler({ manager, maxBodyBytes: 128 }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));

  const response = await fetch(`${origin}/api/local-media/render`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hermest-local-media": "1",
      origin
    },
    body: JSON.stringify({ project: { title: "x".repeat(500) }, platform: "youtube_video" })
  });
  assert.equal(response.status, 413);
});

test("local media HTTP boundary manages BYOK provider keys without leaking values", async t => {
  const workerEnv = { HERMEST_PEXELS_API_KEY: "environment-key-123" };
  const manager = createLocalMediaJobManager({ executeRender: async () => ({}) });
  const { createProviderKeyStore } = await import("../../src/local-media/provider-keys.js");
  const providerKeys = createProviderKeyStore({ env: workerEnv });
  const server = createServer(createLocalMediaRequestHandler({ manager, providerKeys }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(() => new Promise(resolve => server.close(resolve)));

  const listResponse = await fetch(`${origin}/api/local-media/providers`, { headers: { origin } });
  assert.equal(listResponse.status, 200);
  const listed = await listResponse.json();
  assert.equal(listed.ok, true);
  const pexels = listed.providers.find(provider => provider.id === "pexels");
  assert.equal(pexels.configured, true);
  assert.equal(pexels.source, "environment");
  assert.equal(JSON.stringify(listed).includes("environment-key-123"), false);

  const unauthorized = await fetch(`${origin}/api/local-media/providers/elevenlabs/key`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ key: "sk_0123456789abcdef" })
  });
  assert.equal(unauthorized.status, 403);
  assert.equal(workerEnv.HERMEST_ELEVENLABS_API_KEY, undefined);

  const saved = await fetch(`${origin}/api/local-media/providers/elevenlabs/key`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-hermest-local-media": "1" },
    body: JSON.stringify({ key: "sk_0123456789abcdef" })
  });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.provider.configured, true);
  assert.equal(savedBody.provider.source, "session");
  assert.equal(JSON.stringify(savedBody).includes("sk_0123456789abcdef"), false);
  assert.equal(workerEnv.HERMEST_ELEVENLABS_API_KEY, "sk_0123456789abcdef");

  const unknown = await fetch(`${origin}/api/local-media/providers/openai/key`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-hermest-local-media": "1" },
    body: JSON.stringify({ key: "sk_0123456789abcdef" })
  });
  assert.equal(unknown.status, 400);

  const cleared = await fetch(`${origin}/api/local-media/providers/elevenlabs/key`, {
    method: "DELETE",
    headers: { origin, "content-type": "application/json", "x-hermest-local-media": "1" },
    body: "{}"
  });
  assert.equal(cleared.status, 200);
  assert.equal(workerEnv.HERMEST_ELEVENLABS_API_KEY, undefined);

  const environmentClear = await fetch(`${origin}/api/local-media/providers/pexels/key`, {
    method: "DELETE",
    headers: { origin, "content-type": "application/json", "x-hermest-local-media": "1" },
    body: "{}"
  });
  assert.equal(environmentClear.status, 400);
  assert.equal(workerEnv.HERMEST_PEXELS_API_KEY, "environment-key-123");
});
