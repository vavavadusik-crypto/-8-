import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("board UI exposes truthful local render controls and artifact status", async () => {
  const html = await readFile("index.html", "utf8");
  const app = await readFile("src/app.js", "utf8");

  for (const id of [
    "localRenderPlatform",
    "renderLocalVideo",
    "cancelLocalRender",
    "localRenderStatus",
    "localRenderArtifacts"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Публикация не выполняется/);
  assert.match(app, /"x-hermest-local-media": "1"/);
  assert.match(app, /projectId: state\.server\?\.projectId \|\| ""/);
  assert.match(app, /Candidate blockers:/);
  assert.match(app, /\["completed", "failed", "cancelled"\]/);
  assert.match(app, /document\.createElement\("a"\)/);
  assert.match(app, /localRenderArtifacts\.replaceChildren\(\)/);
  assert.doesNotMatch(app, /localRenderArtifacts\.innerHTML/);
});

test("Vite local worker is wired only to loopback dev and preview", async () => {
  const config = await readFile("vite.config.mjs", "utf8");
  assert.match(config, /createLocalVerifiedCandidatePersister\(\)/);
  assert.match(config, /createLocalMediaVitePlugin\(\{/);
  assert.equal((config.match(/host: "127\.0\.0\.1"/g) || []).length, 2);
});
