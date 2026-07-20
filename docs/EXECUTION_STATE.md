# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-20 (Claude Fable 5, седьмая сессия)
ACTIVE PHASE: P2+ — премиум-моушн (директива Вадима «оживи существующий дизайн», приоритет над P3)
ACTIVE TASK: БРАУЗЕРНЫЙ GPT ЗА ГЛАВНЫМ СТОЛОМ (директива Вадима 2026-07-20): AI Director (src/domain/ai-director.js, тема→board строгим JSON-контрактом с retry) + bridge text-model (src/media/text-model.js, OpenAI-совместимый клиент browser-ai-bridge :8788, only-local URL) + CLI scripts/draft-board.mjs; ЖИВОЕ доказательство: браузерный ChatGPT написал план «Почему нейросети галлюцинируют» (6 сцен), идёт полный E2E-рендер
STATUS: IN_PROGRESS
LAST COMMIT: b6f7efc — sequence playback graph. До него: 567ce96 покадровый захват, 8385b37 анимированный markup. Гейт 219/219 unit + 5/5 media (гейт держит HERMEST_SCENE_BUILD_FRAME_LIMIT=6, продакшн — полное окно 2.8s)
NEXT ACTION: (1) проверить E2E-видео из GPT-борда → сэмпл Вадиму; (2) хвост P2.9: интеграция каскада фонов (Pexels-фото + процедурный) в render-project — примитивы уже в main; (3) мост: логин gemini/perplexity (node scripts/login.mjs gemini ИЗ каталога моста), затем изображения из браузерного ChatGPT как image-адаптер каскада. Мост живой на :8788 (setsid), профиль profiles/chatgpt залогинен
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
