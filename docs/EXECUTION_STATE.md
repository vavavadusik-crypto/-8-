# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-20 (Claude Fable 5, седьмая сессия)
ACTIVE PHASE: P2+ — премиум-моушн (директива Вадима «оживи существующий дизайн», приоритет над P3)
ACTIVE TASK: P3 — research→cards и wizard UI (бесплатный стек закрыт: каскад фонов вшит, мост несёт 4 провайдера, Gemini проверен живьём)
STATUS: IN_PROGRESS
LAST COMMIT: см. git log — каскад фонов в render-project (FAL→Pexels fail-open, availability по любому ключу); мост: DeepSeek-адаптер (черновик бесплатного deepseek-исполнителя, отревьюен, 19/19), сервис перезапущен с 4 провайдерами, Gemini жив через /send. Гейт 232/232 unit + 5/5 media
NEXT ACTION: P3.2 research→source cards: публичный research endpoint (api/research) → карточки с цитатами → AI Director обогащает борд фактами (браузерные модели через мост — мозг, ключи не нужны). Затем P3.5 wizard UI («тема → видео» одной кнопкой из борда). DeepSeek: нужен логин Вадима — node scripts/login.mjs deepseek ИЗ каталога моста; селекторы адаптера — canary до первого живого прогона. Мост: :8788, setsid, 4 провайдера. У моста НЕТ git remote — коммиты локальные (завести GitHub-репо = решение Вадима)
UNCOMMITTED: none
NOTES: (а) бесплатный timeline-аудит (deepseek): на fps=30 дрейф кадров 16 сцен ≈1мс — безопасно; НО fps=24-рецепт дал бы ~276мс рассинхрона — при добавлении 24fps-рецепта обязателен guard-тест; (б) бесплатный docs-аудит (nemotron): в docs/RELEASE_READINESS.md накопился дрейф эпохи R1-R2 (строки ~16-18, 55-56, 68 vs 93) — кандидат на чистку бесплатным агентом под присмотром, не приоритет
BLOCKERS: (1) Вадим слушает ru-fullstack-{aterna,george}.mp4 и выбирает release-голос (Piper отвергнут ранее — сэмплы ТОЛЬКО ElevenLabs); (2) FAL live-smoke: аккаунт fal.ai ЗАБЛОКИРОВАН — «Exhausted balance», пополнить на fal.ai/dashboard/billing (~$5) — сам ключ валиден (аутентификация проходит), код готов и ждёт; (3) прослушивание музыкальной подложки (процедурный ambient — можно докинуть CC0-треки в assets/music)

## Дорожная карта (кратко; полностью — MASTER_PLAN)

- [ ] **P0** стабилизация: merge → main, push, deploy, тег, handoff-синк
- [ ] **P1** мультиязычный голос (Piper RU/EN/ES/DE/FR + ElevenLabs BYOK «любой язык», reconciliation, loudnorm)
- [ ] **P2** визуалы + звук (FAL BYOK + style-пресеты, стоковый фолбэк без ключей, музыка с auto-ducking, Ken Burns)
- [ ] **P3** AI Director «тема→видео», semantic shorts + karaoke-сабы, мультиязычные editions, шаблоны
- [ ] **P4** dogfood: перегенерировать ролики Дмитрий/Светлана продуктом на RU/EN/DE/ES → открываются done-for-you продажи
- [ ] **P5** SaaS-ядро: auth + Postgres + object storage + durable queue (то, что требует /api/health)
- [ ] **P6** деньги: биллинг (MoR), тарифы $0/$19/$39/$99, метеринг, watermark Free, brand kit, лендинг, concierge-бета
- [ ] **P7** после денег: R6 автопубликация, R7 analytics, серии, API, voice cloning, OTIO-экспорт

## Журнал чекпоинтов (новые сверху)

- 2026-07-19 · Fable 5 · Мастер-план финализирован (мультиязычность, конкурентный анализ, бэклог B1–B11 включён в фазы), скопирован в репо, создан EXECUTION_STATE. Начата P0.
