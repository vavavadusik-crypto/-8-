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

test("board UI shows elapsed activity and render progress for long jobs", async () => {
  const html = await readFile("index.html", "utf8");
  const app = await readFile("src/app.js", "utf8");

  // elapsed-индикаторы присутствуют и aria-hidden (не спамят скринридер тикающим временем)
  assert.match(html, /id="wizardElapsed"[^>]*aria-hidden="true"/);
  assert.match(html, /id="localRenderElapsed"[^>]*aria-hidden="true"/);
  assert.match(html, /class="job-elapsed"/);
  // таймер стартует и останавливается для обоих длинных путей
  assert.match(app, /createElapsedTimer/);
  assert.match(app, /wizardElapsedTimer\.start\(\)/);
  assert.match(app, /wizardElapsedTimer\.stop\(\)/);
  assert.match(app, /localRenderElapsedTimer\.start\(\)/);
  assert.match(app, /localRenderElapsedTimer\.stop\(\)/);
  // прогресс от worker (аддитивное поле job.progress) отображается
  assert.match(app, /job\.progress\?\.label/);
});

test("board UI persists and resumes in-flight jobs across reload", async () => {
  const app = await readFile("src/app.js", "utf8");
  assert.match(app, /hermest-board:active-jobs:v1/);
  assert.match(app, /persistActiveJob\("draft"/);
  assert.match(app, /persistActiveJob\("render"/);
  assert.match(app, /clearActiveJob\("draft"/);
  assert.match(app, /clearActiveJob\("render"/);
  assert.match(app, /async function resumeDraftJob/);
  assert.match(app, /async function resumeRenderJob/);
  assert.match(app, /resumeActiveJobs\(\)/);
  // reconnect восстанавливает elapsed от createdAt и не авто-применяет терминальный job
  assert.match(app, /Date\.parse\(job\.createdAt\)/);
});

test("board UI renders honest render analytics from job.analytics", async () => {
  const html = await readFile("index.html", "utf8");
  const app = await readFile("src/app.js", "utf8");
  assert.match(html, /id="localRenderAnalytics"/);
  assert.match(app, /function renderRenderAnalytics/);
  assert.match(app, /job\.analytics/);
  assert.match(app, /Аналитика ролика/);
  assert.match(app, /LUFS/);
  assert.match(app, /videoSha256/);
  // расширенный контракт M1: разрешение/формат, QC, true peak, b-roll, warnings/blockers
  assert.match(app, /analyticsResolutionText/);
  assert.match(app, /Проверка \(QC\)/);
  assert.match(app, /aspectRatio/);
  assert.match(app, /truePeakDbtp/);
  assert.match(app, /analytics\.footageCount/);
  assert.match(app, /analytics\.warnings/);
  assert.match(app, /analytics\.blockers/);
  // аналитика отображается только на completed, не выдумывается для активных
  assert.match(app, /renderRenderAnalytics\(completed\)/);
  // безопасный DOM без innerHTML
  assert.doesNotMatch(app, /localRenderAnalytics\.innerHTML/);
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

test("board UI exposes a truthful B-roll mode selector wired into the brief", async () => {
  const html = await readFile("index.html", "utf8");
  const app = await readFile("src/app.js", "utf8");

  // Селектор существует со всеми 4 режимами, совпадающими с VALID_BROLL_MODES бэкенда.
  assert.match(html, /id="brollMode"/);
  for (const mode of ["auto", "free", "premium", "deterministic"]) {
    assert.match(html, new RegExp(`value="${mode}"`));
  }
  // Честное позиционирование: это монтаж, не «text-to-video».
  assert.match(html, /не «text-to-video»/i);

  // brollMode есть в дефолтном brief и валидируется в normalizeBrief с фолбэком "auto".
  assert.match(app, /brollMode: "auto"/);
  assert.match(app, /BROLL_MODES\s*=\s*\["auto", "free", "premium", "deterministic"\]/);
  assert.match(app, /BROLL_MODES\.includes\(source\.brollMode\)/);
  assert.match(app, /brollModeSelect\.addEventListener\("change"/);
  // brollMode доезжает до рендера через brief: buildProjectDocument -> brief: state.brief.
  assert.match(app, /brief: state\.brief/);
});
