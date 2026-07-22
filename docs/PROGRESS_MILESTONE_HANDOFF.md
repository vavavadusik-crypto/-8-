# Milestone Handoff — прогресс-фидбэк длинной генерации (draft + render)

База: `main` @ render-cancel закрыт (7afda71). Две изолированные полосы, непересекающиеся файлы, интегратор мержит.
Правила: локальные LLM не запускать; тяжёлые ffmpeg-рендеры в тестах НЕ гонять (моки); push/deploy запрещены; терминальный claude — соло (без Task/субагентов/workflow).

## Разрыв (подтверждён gap-аудитом)
Draft (reasoning-чат, минуты) и render MP4 показывают статичный текст без ощущения прогресса: нет истёкшего времени, индикатора активности, этапов. Пользователь не понимает, идёт ли ещё работа.

## Полосы и владение файлами

### Полоса A — frontend/product UX + интеграция (я)
Ветка `feat/progress-ux`, worktree — основной репозиторий.
Файлы (только эти): `index.html`, `src/app.js`, frontend CSS/DOM, frontend-тесты, пользовательские доки.

### Полоса B — backend/runtime (терминальный claude, соло)
Ветка `feat/progress-runtime`, worktree `../hermest-board-backend`.
Файлы (только эти): `src/local-media/**`, `src/media/**`, backend-тесты. НЕ трогать index.html, src/app.js, frontend CSS/доки.

## Общий API-контракт (единственная точка связи)
Render job GET `/api/local-media/jobs/:id` МОЖЕТ включать поле `progress` (аддитивно, обратная совместимость — если поля нет, фронт показывает только elapsed):
```
progress: {
  phase: "queued" | "preflight" | "scenes" | "audio" | "encode" | "finalize" | "done",
  sceneIndex?: number,   // 0-based текущая сцена (когда phase==="scenes")
  sceneTotal?: number,
  label?: string         // человекочитаемо, напр. "Сцена 3 из 6" — без путей/секретов, длина ≤ 120
}
```
Draft job GET `/api/local-media/draft/:id` — опаковый (один вызов модели), progress НЕ обязателен; фронт показывает elapsed + активность.
Успешные ответы формат не менять; поле `progress` только добавляется. Ошибки — контракт `{error, code}`.

## Backend acceptance (полоса B, TDD — сперва падающий тест)
1. Render job проставляет `progress` в записи job по мере выполнения (preflight → scenes с sceneIndex/sceneTotal → audio → encode → finalize → done); GET возвращает его.
2. Прогресс приходит через инъектируемый reporter/callback, чтобы тестировать МОК-адаптером, а не реальным ffmpeg (НЕ гонять реальный рендер).
3. `label` санитизирован (без абсолютных путей/секретов/stack, длина ≤ 120).
4. Не ломать существующие success/cancel/error/late-result пути (перегнать их тесты).
5. При cancel/failed прогресс не «застревает» ложным done.

## Frontend acceptance (полоса A)
1. Пока draft или render активны — показывать истёкшее время (mm:ss) и индикатор активности (спиннер/пульс).
2. Если render job вернул `progress.label` — показывать его (напр. «Сцена 3 из 6»).
3. Таймер/индикатор корректно останавливаются и очищаются на терминальном статусе (completed/failed/cancelled) и при ошибке.
4. A11y: тикающий таймер НЕ спамит скринридер (визуальный, `aria-hidden`); смена фазы/статуса — через существующий live-region.
5. Не мешает отмене (кнопка отмены остаётся доступной). Desktop + mobile 375px. Без mock-данных в пользовательском пути.

## Команды проверки
- Лёгкий gate: `npm run validate && npm run test:unit && npm run smoke:api && npm run build`.
- Полный `npm run check` — один раз на финальной интеграции, ТОЛЬКО если менялся `src/media/**`.
