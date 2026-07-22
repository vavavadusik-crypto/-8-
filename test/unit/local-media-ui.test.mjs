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
    "localRenderArtifacts",
    "narrationLanguage",
    "narrationVoice",
    "narrationProvider",
    "narrationHint"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Публикация не выполняется/);
  assert.match(app, /"x-hermest-local-media": "1"/);
  assert.match(app, /brief: state\.brief/);
  assert.match(app, /ru_RU-dmitri-medium/);
  assert.match(app, /ru_RU-irina-medium/);
  assert.match(app, /narrationProvider/);
  assert.match(app, /ElevenLabs/);
  assert.match(app, /projectId: state\.server\?\.projectId \|\| ""/);
  // Статус рендера — понятный пользователю, но правдивый: дружелюбные заголовки по статусу
  // при сохранении честной подачи блокеров/проблем.
  assert.match(app, /Рендер отменён/);
  assert.match(app, /Что мешает:/);
  assert.match(app, /\["completed", "failed", "cancelled"\]/);
  assert.match(app, /document\.createElement\("a"\)/);
  assert.match(app, /localRenderArtifacts\.replaceChildren\(\)/);
  assert.doesNotMatch(app, /localRenderArtifacts\.innerHTML/);
});

test("board UI manages BYOK provider keys without persisting them", async () => {
  const html = await readFile("index.html", "utf8");
  const app = await readFile("src/app.js", "utf8");

  assert.match(html, /id="byokProviders"/);
  assert.match(html, /не попадают в проект/);
  assert.match(app, /\/api\/local-media\/providers/);
  assert.match(app, /keyInput\.type = "password"/);
  assert.match(app, /keyInput\.value = ""/);
  assert.match(app, /providers\/\$\{encodeURIComponent\(provider\.id\)\}\/key/);
  // ключ не должен попадать в состояние доски и localStorage
  assert.doesNotMatch(app, /localStorage\.setItem\([^)]*keyInput/);
  assert.doesNotMatch(app, /state\.[A-Za-z.[\]"']*\s*=\s*keyInput\.value/);
  assert.doesNotMatch(app, /brief[^\n]*apiKey/i);
});

test("Vite local worker is wired only to loopback dev and preview", async () => {
  const config = await readFile("vite.config.mjs", "utf8");
  assert.match(config, /createLocalVerifiedCandidatePersister\(\)/);
  assert.match(config, /createLocalMediaVitePlugin\(\{/);
  assert.equal((config.match(/host: "127\.0\.0\.1"/g) || []).length, 2);
});
