# Integration Handoff — параллельные полосы (frontend/UX ↔ backend/runtime)

Две изолированные полосы работают одновременно и **не редактируют одни и те же файлы**.
Интегратор (frontend/UX) выполняет финальный merge и сквозную верификацию.

## Полоса A — Frontend / Product UX (интегратор, ветка `integrator/ux-release-candidate`)

**Владелец:** этот Claude (оркестратор-интегратор).
**Файлы (только эти):**
- `index.html` (разметка + `<style>` + inline UI)
- `src/app.js` (клиентская логика доски, wizard-UI, онбординг, состояния)
- `src/card-image.js`
- `public/sw.js`, `public/manifest*`, статические ассеты UI

**Задачи (release-candidate UX):**
- Первый-запуск онбординг: новый пользователь понимает назначение и попадает в основной сценарий без инструкции.
- Заметный вход в главный сценарий «Тема → видео» (сейчас спрятан в боковой панели).
- Состояния loading/empty/error/success для ключевых форм.
- A11y (роли, фокус, клавиатура), адаптивность (mobile layout), никаких мёртвых кнопок.

**Acceptance:** новый пользователь на `npm run dev` за <30с находит и запускает основной сценарий; консоль без ошибок; preview-проверка (snapshot/inspect) зелёная.

## Полоса B — Backend / Runtime (терминальный claude, ветка `feat/backend-runtime` на своей стороне)

**Владелец:** терминальный Claude (Opus 4.8, соло, `--disallowed-tools Task`).
**Файлы (только эти):**
- `api/**` (product.js, agent, ai, jobs, storage, connectors, …)
- `src/local-media/**` (vite-plugin, draft-service, draft-job-manager, render worker)
- `src/media/**` (ffmpeg-args, scene-*, *-text-model, image-source, tts)
- `scripts/**`, `Dockerfile`, `nginx.conf`

**Задачи:** стабильность запуска, явные ошибки API (fail-closed), безопасность внешнего ввода, детерминизм рендера, миграции/durable storage (P5, если разблокировано).

## Общий API-контракт (не менять в одностороннем порядке)

Локальный media worker (vite-plugin middleware, loopback-only):
- `POST /api/local-media/draft` `{topic, sceneCount, research, model, byok?}` → `202 {jobId}`
- `GET  /api/local-media/draft/:id` → `{id, status: queued|running|done|error|cancelled, board?, warnings?, error?}`
- `DELETE /api/local-media/draft/:id` → отмена
- `GET  /api/local-media/bridge` → `{available, providers[]}` (проксирует мост /health)
- Рендер MP4: существующие маршруты local-media (job submit → poll → artifacts+manifest).

Секреты BYOK: только `process.env` worker-процесса; никогда в проект, localStorage, manifest, логи.
Изменение контракта — сперва правка ЭТОГО раздела + согласование, потом реализация обеих сторон.

## Правила
- Никаких перекрёстных правок файлов чужой полосы. Общий src/app.js ↔ api/*: контракт выше — единственная точка связи.
- После каждой законченной части — evidence: изменённые файлы, команды проверки, результат.
- `npm run check` — общий gate. Интегратор гоняет его на merge.
- Без push/deploy без прямого разрешения Вадима (директива 2026-07-22 переопределяет standing-approval).
- Локальные LLM (Ollama) не запускать; проверять моками/детерминированными тестами.
