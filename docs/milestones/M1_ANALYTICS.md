# M1 — Analytics ролика (per master-prompt PHASE 1)

Статус: **в работе** — базовый M1 закрыт (main @ 101013c), расширяется до полного контракта master-prompt.

## PHASE 0 recovery note (2026-07-23)
- Ветка: `main` @ 826880d, +48 локальных коммитов (origin/main = a12395d, НЕ запушено — по правилу).
- M1-база смержена: `83c2349` (backend `job.analytics`), `0998136` (frontend блок), merge `101013c`.
- Контракт: `docs/ANALYTICS_MILESTONE_HANDOFF.md`. Тесты M1: `test/unit/local-media-render-analytics.test.mjs` (6) + `local-media-ui.test.mjs` (analytics-тест). Всего 340 unit зелёных.
- Реальный manifest-эталон: `tmp/youtube_video-YbE4DR/youtube-16x9-1080p.manifest.json` (schema подтверждена).
- Прогресс сохранён, конфликтов нет, дубли ветки/файла не создаются.

## Текущее покрытие analytics (база 83c2349)
`durationSeconds, integratedLufs, loudnessRangeLu, voice, language, recipeId, sceneCount, musicUsed, artifactCount, totalBytes, videoBytes, videoSha256` — только completed, из verified manifest, null/0 без выдумки.

## Расширение до контракта master-prompt (PHASE 1.1)
Добавить в тот же mapper из УЖЕ существующих manifest-данных:
- `resolution {width,height}` ← `videoArtifact.probe.video.{width,height}`;
- `aspectRatio` ← из width/height (напр. "16:9");
- `truePeakDbtp` ← `qc.loudness.truePeakDbtp` (null если не измерялось);
- `footageCount` ← `manifest.footage?.length ?? 0`;
- `recipeHash` ← `manifest.recipeSha256`;
- `videoName`, `videoType` ← video artifact name/type;
- `qcPassed` ← `manifest.qc.passed === true` (или null);
- `blockers`, `warnings` ← manifest/record (санитизированные строки);
- `completedAt` ← `record.completedAt` (ISO).
Обратная совместимость: существующие поля не переименовывать; новые аддитивны.

## Верификация (PHASE 1.4) — заполняется по завершении
(команды, exit codes, реальный smoke render, UI/API на реальном job)

## M1-ext ЗАКРЫТ (PHASE 1 полный контракт) — 2026-07-23

Обе полосы слиты в main: backend af46c4e (feat/m1-ext-runtime — deriveRenderAnalytics расширен до resolution/aspectRatio/truePeakDbtp/footageCount/recipeHash/videoType/qcPassed/blockers/warnings/completedAt/loudnessRangeLu/totalBytes; +real manifest fixture; 11 analytics-тестов), frontend 04442d2 (feat/m1-ext-ux — блок аналитики расширен: разрешение+aspect, QC, True Peak, B-roll count, warnings/blockers; всё деградирует в «—»).
Контракт полей 1:1: всё, что читает фронт (17 полей), backend отдаёт.
ПОЛНЫЙ gate (реальный ffmpeg — требование M1.4): validate ok · 345 unit / 0 fail · smoke:api ok · 5 media / 0 fail (3 реальных MP4-рендера EN/RU + repeat-детерминизм) · build ok · render smoke ok. GATE EXIT 0.
Push НЕ делался (master-prompt: без публичного push до разрешения). PHASE 1 ✅.
