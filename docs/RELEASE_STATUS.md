# Hermest Board — статус готовности к релизу

Версия: `0.2.0` (`package.json`).
Дата: см. `git log` последнего release-коммита (в этом окружении системная дата недоступна скрипту).
Где мы прямо сейчас: `docs/EXECUTION_STATE.md` (читать первым). Порядок работ: `docs/MASTER_PLAN_2026-07-19.md`.

## Итог quality-gate

Полный гейт `npm run check` прошёл **зелёным** — это фактический прогон команд, а не заявление:

- `validate` — статические проверки (`node --check` по `src/`+`api/`, целостность `index.html` и каталога провайдеров);
- **272 unit** — `node --test test/unit/*.test.mjs`;
- `smoke:api` — контрактный smoke API-слоя;
- **5 media** — интеграционные рендеры на **реальном FFmpeg** (H.264/AAC, детерминизм хешей, ducking-замер);
- `build` — Vite-сборка статики в `dist/`;
- **render smoke** — сквозной smoke рендера MP4.

## Матрица 11 критериев готовности

| # | Критерий | Статус | Обоснование |
|---|---|---|---|
| 1 | Установка/запуск по докам | DONE | README актуализирован под все фичи; `engines.node` закреплён (`>=20.11 <23`); путь `npm install` → `npm run dev` проверен. |
| 2 | Браузерный UI без критических ошибок | DONE | Доска и wizard «тема→видео» работают; browser smoke зелёный; SW network-first отдаёт свежий UI. |
| 3 | Запросы к AI-провайдерам (создать/отправить/просмотреть) | DONE | Директор через браузерный мост (4 провайдера live) и любой OpenAI-совместимый API (пресеты + свой URL); wizard тема→черновик проверен вживую E2E (Ollama, без ключей). |
| 4 | Состояние/настройки/восстановление | DONE | Состояние доски и настройки (`brief.generateVisuals`, BYOK-панель ключей) сохраняются и восстанавливаются на клиенте; durable cross-device — намеренная граница (см. ниже). |
| 5 | Backend/frontend/API/Docker/Linux согласованы | DONE | Docker-образ собран (`npm ci`, `.dockerignore`), отдаёт SPA с HTTP 200; контракты API/фронта согласованы; целевой Linux. |
| 6 | Сценарии проверены вручную + тестами | DONE | 272 unit + 5 media (реальный FFmpeg) + smoke; ключевые пути (wizard, рендер, каскад медиа) прогнаны вживую оркестратором. |
| 7 | Нет критических багов / небезопасных секретов / мёртвого кода / необоснованных заглушек | DONE | `audit:secrets` чист; секреты только через `${ENV}`/session-vault, не в коде/логах; адаптеры fail-closed; skeleton OAuth — задокументированная намеренная граница, не тихая заглушка. |
| 8 | Понятные ошибки, сбой провайдера не рушит приложение | DONE | Адаптеры fail-closed с явными сообщениями; каскад изображений FAL→Pollinations→Pexels; wizard — async job с отменой, UI не виснет при таймауте провайдера. |
| 9 | Код чистый/модульный | DONE | Слои Domain/Application/Infrastructure/Presentation; `validate` без сломанных импортов; одна ответственность на модуль. |
| 10 | Docs актуальны | DONE | README, `RELEASE_STATUS.md` (этот файл), `NEXT_AGENT_HANDOFF.md`, `RELEASE_READINESS.md` синхронизированы с фактическим состоянием. |
| 11 | Release package + SHA-256 manifest + статус + handoff | DONE | `scripts/build-release.mjs` → детерминированный `dist/RELEASE_MANIFEST.sha256`; этот статус-отчёт; раздел RELEASE HANDOFF в `NEXT_AGENT_HANDOFF.md`. |

## Что работает

- Интерактивная доска карточек.
- Wizard «тема → видео» (async: submit → poll, UI не блокируется; отмена работает).
- AI-директор: браузерный мост (4 провайдера) **и** любой OpenAI-совместимый API — пресеты OpenRouter / Groq / Together / DeepSeek / Mistral / HuggingFace / OpenAI / Ollama + произвольный URL.
- Мультиязычная озвучка: Piper (бесплатно, offline) + ElevenLabs (BYOK).
- Изображения/фоны: Pollinations (бесплатно, без ключа, opt-in тумблер) + FAL (BYOK) + Pexels (b-roll).
- Премиум-анимация: Ken Burns, b-roll-оверлеи, музыкальная подложка с auto-ducking.
- Детерминированный FFmpeg-рендер MP4 16:9 и 9:16 + SRT + manifest + SHA-256 sidecar.
- BYOK-панель ключей в UI (set/clear, статус); ключи не покидают worker-процесс.
- Service Worker: network-first для HTML, cache-first только для `/assets/`.

**Все медиатипы имеют и бесплатный, и BYOK путь**: текст (Ollama/OpenRouter/… или свой ключ) · картинки (Pollinations / FAL) · голос (Piper / ElevenLabs) · музыка (процедурная / свои CC0-треки).

## Намеренные границы (не баги)

- **OAuth token exchange** — skeleton. Публикация в соцсети требует ревью платформ и immutable-approval; сознательно не реализовано.
- **Durable-хранилище / auth** — фундамент (jobs/approval-записи, session-vault). Полный auth + Postgres + object storage + durable queue — этап P5 (SaaS-ядро).
- **Semantic shorts** — вертикаль честно помечена `aspect_only`: реальные 9:16 файлы есть, семантический ре-монтаж отложен.

## Как проверить

```bash
npm install                       # зависимости (нужен ffmpeg в системе)
npm run dev                       # локальный запуск (127.0.0.1)
npm run check                     # полный гейт: validate · unit · smoke:api · media · build · render smoke
npm run build && npm run release:manifest   # собрать dist/ и сгенерировать dist/RELEASE_MANIFEST.sha256
docker build -t hermest-board .   # образ статики (SPA), отдаёт HTTP 200
```

`dist/` и `dist/RELEASE_MANIFEST.sha256` — в `.gitignore` (артефакт сборки, не коммитится); manifest воспроизводим из любого идентичного `dist/`.
