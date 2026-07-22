# Milestone Handoff — паритет lifecycle отмены рендер-джобы MP4

База: `main` @ cancel-milestone закрыт. Две изолированные полосы, непересекающиеся файлы, интегратор мержит.
Правила сессии: локальные LLM не запускать; тяжёлые ffmpeg-рендеры в тестах НЕ гонять (моки); push/deploy запрещены; терминальный claude — соло (без Task/субагентов/workflow).

## Разрыв (подтверждён gap-аудитом, не вслепую)
Рендер-джоба MP4 (`renderLocalVideo`/`cancelLocalRender`/`renderLocalJobStatus`) уже имеет кнопку отмены, DELETE с корректным content-type и pollToken. НО:
- Frontend: `#localRenderStatus` не является live-region; сбой отмены оставляет кнопку заблокированной (нет повтора); статус — сырой developer-дамп, не для обычного пользователя; cancelled без понятного финального сообщения.
- Backend: рендер-cancel на старом boolean-паттерне (`manager.cancel` → bool), в отличие от draft `{outcome}`; под вопросом идемпотентность, защита от late-result и — ключевое — фактическое завершение дочерних процессов (ffmpeg/chrome) при отмене.

## Полосы и владение файлами

### Полоса A — frontend/product UX + интеграция (я)
Ветка `feat/render-cancel-ux` (worktree — основной репозиторий).
Файлы (только эти): `index.html`, `src/app.js`, frontend CSS/DOM, пользовательские доки, frontend-тесты.

### Полоса B — backend/runtime (терминальный claude, соло)
Ветка `feat/render-cancel-runtime`, worktree `../hermest-board-backend`.
Файлы (только эти): `src/local-media/**` (job-manager, render worker, vite-plugin), `src/media/**`, backend-тесты. НЕ трогать index.html, src/app.js, frontend CSS/доки.

## Общий API-контракт (единственная точка связи)

`DELETE /api/local-media/jobs/:id` (id — рендер-job):

| Ситуация | HTTP | Тело |
|---|---|---|
| Job `queued`/`running` → отменяется | `202` | `{ok:true, job:{id, status:"cancelled", …}}` |
| Job уже `cancelled` (повтор) | `202` | `{ok:true, job:{status:"cancelled"}}` — **идемпотентно** |
| Job `completed`/`failed` (терминальный) | `409` | `{ok:false, error, code:"local_media_job_not_cancellable"}` |
| Неизвестный id | `404` | `{ok:false, error, code:"local_media_job_not_found"}` |
| Внутренний сбой | `500` | `{ok:false, error, code:"…"}` — но **никогда** не роняет middleware |

`GET /api/local-media/jobs/:id` → `{job:{id, status, artifacts?, blockers?, warnings?, error?, …}}`; статусы: `queued|running|completed|failed|cancelled`. Успешные ответы формат не менять.

## Backend acceptance (полоса B, строго TDD — сперва падающий тест)
1. Проверить фактический контракт DELETE /jobs/:id и `manager.cancel()`.
2. Привести cancel к `{outcome}` как у draft: идемпотентно (повтор cancelled → 202), unknown → 404, terminal → 409.
3. **Дочерние процессы**: при отмене running-рендера реально завершать порождённые ffmpeg/chrome-процессы (kill/SIGTERM→SIGKILL) — тест с mock-долгим-child-процессом (НЕ реальный ffmpeg): cancel убивает child, процесс не остаётся сиротой.
4. После cancel job не становится `completed`; поздний результат рендера отбрасывается; статус остаётся `cancelled`.
5. Повторная отмена и отмена несуществующего → не 500, middleware не падает.
6. Очистка таймеров/polling.
7. Ошибки — контракт `{error, code}`; секреты/абсолютные пути/stack traces не утекают.

## Frontend acceptance (полоса A)
1. `#localRenderStatus` — live status-region (`role="status" aria-live="polite"`); кнопка отмены доступна с клавиатуры + `aria-label`.
2. Понятные пользователю сообщения по статусу: в очереди / идёт рендер / отменяется / **отменён (можно изменить настройки и запустить снова)** / ошибка / готово — developer-детали (recipe/blockers) вторичны, не ведущая строка.
3. Сбой отмены → сообщение + **кнопка отмены снова доступна для повтора** (не зависает disabled).
4. Гарды двойного submit (есть) и двойного cancel.
5. Устойчивость к ответам: 202→cancelled; 409→перечитать статус; 404→сброс.
6. Desktop + mobile 375px. Без mock-данных в пользовательском пути.

## Команды проверки
- Лёгкий gate: `npm run validate && npm run test:unit && npm run smoke:api && npm run build`.
- Полный `npm run check` — один раз на финальной интеграции, ТОЛЬКО если менялся `src/media/**` или нужен по критериям.
