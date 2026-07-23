# Milestone Handoff — аналитика ролика (M1, ответ на InMedia)

База: `main` @ resume закрыт (88cad83). Две изолированные полосы, непересекающиеся файлы, интегратор мержит.
Правила: локальные LLM не запускать; тяжёлые ffmpeg-рендеры в тестах НЕ гонять (фикстуры/моки manifest); push/deploy запрещены; терминальный claude — соло (без Task/субагентов/workflow).

## Зачем
Конкурент InMedia заявляет «аналитику» как преимущество. Закрываем честно и бесплатно: сводка по фактически отрендеренному ролику из УЖЕ верифицированных данных manifest (ничего не выдумывать).

## Полосы и владение файлами
### Полоса A — frontend/product UX + интеграция (я)
Ветка `feat/analytics-ux`, worktree — основной репозиторий. Файлы: `index.html`, `src/app.js`, frontend CSS/DOM, frontend-тесты, пользовательские доки.
### Полоса B — backend/runtime (терминальный claude, соло)
Ветка `feat/analytics-runtime`, worktree `../hermest-board-backend`. Файлы: `src/local-media/**` (job-manager), при необходимости `src/media/manifest.js` (только если нужно ЧИТАТЬ/агрегировать; НЕ менять формат manifest), backend-тесты. НЕ трогать index.html, src/app.js, frontend CSS/доки. Если тронешь `src/media/**` — скажи в отчёте (потребуется media-gate).

## Общий API-контракт (единственная точка связи)
Завершённый (`completed`) render-job в GET `/api/local-media/jobs/:id` получает аддитивное поле `analytics` (для не-completed отсутствует):
```
analytics: {
  durationSeconds: number,        // из manifest
  integratedLufs: number|null,    // громкость
  loudnessRangeLu: number|null,
  voice: string,                  // из manifest
  language: string,
  recipeId: string,               // recipe.id
  sceneCount: number,             // число сцен/футажей (из storyboard/footage)
  musicUsed: boolean,
  artifactCount: number,
  totalBytes: number,             // сумма bytes всех артефактов
  videoBytes: number,             // размер mp4
  videoSha256: string             // sha256 mp4 (из verified artifact)
}
```
Значения ТОЛЬКО из уже верифицированного manifest/artifacts (result.manifest на финализации). Формат прочих полей job и manifest НЕ менять. Отсутствующие поля → null/0, без выдумки.

## Backend acceptance (полоса B, TDD — сперва падающий тест)
1. На финализации completed-job деривировать `analytics` из `result.manifest` (+ verified artifacts) и класть в запись; publicJob отдаёт его только для completed.
2. Строго из существующих данных: durationSeconds, integratedLufs/loudnessRangeLu, voice, language, recipe.id, sceneCount (найди достоверный источник — storyboard/footage длина), musicUsed, artifactCount, totalBytes, videoBytes, videoSha256. Отсутствует → null/0.
3. Санитизация: никаких путей/секретов/stack; только числа/короткие строки/хеши.
4. cancelled/failed/queued/running → analytics ОТСУТСТВУЕТ (не показывать ложную аналитику).
5. Не ломать submit/get/cancel/progress/resume/late-result — перегнать (сейчас ~333 зелёных).
6. Тест на manifest-фикстуре (НЕ реальный ffmpeg): completed job с подставным result.manifest → GET.analytics совпадает с ожиданием.

## Frontend acceptance (полоса A)
1. Когда render завершился completed и job.analytics присутствует — показать блок «Аналитика ролика» с человекочитаемой сводкой: длительность (mm:ss), громкость (LUFS), размер MP4 (КБ/МБ), число сцен, голос+язык, платформа/recipe, SHA-256 (укорочённый). 
2. Нет analytics / не completed → блок скрыт.
3. Читаемо, a11y (заголовок/список, не dev-дамп), desktop + mobile 375px. Без mock-данных.
4. Опционально: кнопка «Скопировать сводку» (plain text) — если просто.

## Команды проверки
- Лёгкий gate: `npm run validate && npm run test:unit && npm run smoke:api && npm run build`. Полный `npm run check` — только если тронут `src/media/**`.
