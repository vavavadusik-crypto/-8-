# Milestone Handoff — управляемая отмена draft-job (cancel lifecycle)

База: `main` @ RC-merge. Две изолированные полосы, непересекающиеся файлы, интегратор мержит.
Правила сессии: локальные LLM не запускать; push/deploy запрещены; терминальный claude — соло (без Task/субагентов/workflow).

## Разрыв
«Собрать из темы» может идти минутами; кнопка блокируется, но пользователь **не может отменить** задачу.
Бэкенд уже имеет `DELETE /api/local-media/draft/:id`, но идемпотентность/late-result/очистка не гарантированы, а UI не даёт отмены.

## Полосы и владение файлами

### Полоса A — frontend/product UX + интеграция (я)
Ветка `feat/draft-cancel-ux` (worktree — основной репозиторий).
Файлы (только эти): `index.html`, `src/app.js`, frontend CSS/DOM (в `index.html`), пользовательские доки (`README.md`), frontend-тесты.

### Полоса B — backend/runtime (терминальный claude, соло)
Ветка `feat/draft-cancel-runtime`, worktree `../hermest-board-backend`.
Файлы (только эти): `src/local-media/**`, `src/media/**`, backend-тесты (`test/unit/**`, `test/integration/**`), runtime-scripts при необходимости.
НЕ трогать: `index.html`, `src/app.js`, frontend CSS/доки.

## Общий API-контракт (единственная точка связи; менять только правкой этого раздела)

`DELETE /api/local-media/draft/:id` (id — `draft_[A-Za-z0-9-]+`):

| Ситуация | HTTP | Тело |
|---|---|---|
| Job в `queued`/`running` → отменяется | `202` | `{ok:true, job:{id, status:"cancelled", …}}` |
| Job уже `cancelled` (повторная отмена) | `202` | `{ok:true, job:{status:"cancelled"}}` — **идемпотентно** |
| Job уже `completed`/`failed` (терминальный) | `409` | `{ok:false, error, code:"draft_job_not_cancellable"}` |
| Неизвестный id | `404` | `{ok:false, error, code:"draft_job_not_found"}` |
| Внутренний сбой | `500` | `{ok:false, error, code:"…"}` — но **никогда** не роняет middleware |

`GET /api/local-media/draft/:id` → `{job:{id, status, board?, warnings?, error?}}`; статусы: `queued|running|completed|failed|cancelled`.

Успешные ответы формат не менять (обратная совместимость). Ошибки сохраняют контракт `{error, code}` (строка `error` + машинный `code`); фронт читает `data.error`.

## Правила идемпотентности и жизненного цикла (backend)
1. Cancel идемпотентен: повторная отмена cancelled-job → 202, не 409/500.
2. Терминальные `completed`/`failed` неизменны: cancel → 409 (детерминированно, задокументировано).
3. После cancel job **не может** стать `completed`: поздний ответ provider/worker игнорируется, статус остаётся `cancelled`.
4. Отмена очищает таймеры, polling и дочерние процессы job; middleware/dev-server не падает.
5. Если upstream-HTTP физически не прервать — job всё равно → `cancelled`, поздний результат отбрасывается.
6. Секреты/абсолютные пути/stack traces не утекают в ответ.
7. Старт с детерминированных падающих тестов, затем минимальная реализация.

## Frontend acceptance (полоса A)
1. В `queued`/`running` — заметная кнопка «Отменить».
2. Состояния: запуск · выполняется · отменяется · отменено · ошибка отмены · успешно.
3. Гард от двойного submit и конкурирующих submit/cancel.
4. После отмены — можно поправить тему/настройки и запустить снова.
5. Сообщения — для обычного пользователя, не для разработчика.
6. A11y: `aria-*`, кнопка доступна с клавиатуры, live status-region, управление фокусом.
7. Desktop + mobile 375px. Без mock-данных в пользовательском пути.
8. Устойчивость к вариантам ответа: 202→cancelled; 409→перечитать статус; 404→сброс.

## Команды проверки
- Общий лёгкий gate: `npm run validate && npm run test:unit && npm run smoke:api && npm run build`.
- Полный `npm run check` — один раз на финальной интеграции (реальный FFmpeg), только если tree менялся.
