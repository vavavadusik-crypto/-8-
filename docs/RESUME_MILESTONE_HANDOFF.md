# Milestone Handoff — восстановление in-flight задач после перезагрузки (resume)

База: `main` @ progress закрыт (34c8421). Две изолированные полосы, непересекающиеся файлы, интегратор мержит.
Правила: локальные LLM не запускать; тяжёлые ffmpeg-рендеры в тестах НЕ гонять (моки); push/deploy запрещены; терминальный claude — соло (без Task/субагентов/workflow).

## Разрыв (подтверждён gap-аудитом)
Доска persist в localStorage, но активная генерация теряется при reload: фронт не хранит id draft/render-джобы, поэтому после перезагрузки пользователь не видит идущую задачу и не может её отменить/дождаться, хотя worker её ещё держит. Дополнительно: draft-job-manager TTL-eviction = 10 мин — long draft (reasoning >10мин) рискует быть вычищенным ещё РАБОТАЯ.

## Полосы и владение файлами
### Полоса A — frontend/product UX + интеграция (я)
Ветка `feat/resume-ux`, worktree — основной репозиторий. Файлы: `index.html`, `src/app.js`, frontend CSS/DOM, frontend-тесты, пользовательские доки.
### Полоса B — backend/runtime (терминальный claude, соло)
Ветка `feat/resume-runtime`, worktree `../hermest-board-backend`. Файлы: `src/local-media/**`, backend-тесты. НЕ трогать index.html, src/app.js, frontend CSS/доки. (`src/media` трогать НЕ нужно — media-gate не потребуется.)

## Общий API-контракт (единственная точка связи)
GET `/api/local-media/draft/:id` и GET `/api/local-media/jobs/:id` — существующие; добавить/подтвердить в publicJob поле `createdAt` (ISO-строка) на ОБОИХ (draft уже имеет; render имеет createdAt/startedAt) — фронт по нему восстанавливает elapsed при reconnect. Формат успешных ответов иначе не менять.
Reconnect неизвестного/вычищенного job → существующая структурная 404 (`draft_job_not_found` / `local_media_job_not_found`). Статусы прежние: `queued|running|completed|failed|cancelled`.

## Backend acceptance (полоса B, TDD — сперва падающий тест)
1. TTL-eviction применяется ТОЛЬКО к терминальным job (`completed|failed|cancelled`). Активные (`queued|running`) НИКОГДА не вычищаются по TTL, пока не станут терминальными — иначе long-running draft/render «теряется» работая. Проверить фактическое поведение обоих менеджеров (draft-job-manager, job-manager) и починить, если активные вычищаются.
2. Подтвердить `createdAt` (ISO) в publicJob обоих менеджеров; если у render publicJob его нет наружу — добавить аддитивно.
3. Reconnect по id работает после «отключения» отправителя (job живёт в памяти до терминала+TTL); unknown → 404 структурно.
4. Не ломать существующие submit/get/cancel/progress/late-result пути — перегнать их тесты (сейчас ~323 зелёных).
5. Ошибки — контракт {error, code}; секреты/пути не утекают.

## Frontend acceptance (полоса A)
1. Персист активных id (draft, render) в localStorage при submit; очистка при терминальном статусе.
2. На загрузке для каждого сохранённого id — GET статуса:
   - `queued|running` → восстановить UI выполнения (заблокировать submit, показать кнопку отмены, elapsed от `createdAt`), возобновить polling; на завершении — обычная обработка (draft применяет борд, render показывает артефакты);
   - терминальный → короткий нейтральный статус и очистка (НЕ авто-применять борд и НЕ авто-скачивать — пользователь мог изменить доску);
   - 404/evicted → тихо очистить.
3. Гарды: не запускать вторую задачу, интеграция с существующими double-submit/cancel гардами.
4. A11y (live-region статус, фокус не угонять на reconnect), desktop + mobile 375px, без mock-данных в пользовательском пути.

## Команды проверки
- Лёгкий gate: `npm run validate && npm run test:unit && npm run smoke:api && npm run build` (src/media НЕ трогается → полный media-gate НЕ нужен).
