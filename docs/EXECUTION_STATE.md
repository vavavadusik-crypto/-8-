# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-21 (Claude Opus 4.8, восьмая сессия — Fable бережём, механику делает терминальный claude соло)
ACTIVE PHASE: P3 / UX — браузерные модели удобно в Hermest Board (директива Вадима 2026-07-21)
ACTIVE TASK: UX-1 — браузерный мост как ВЫБИРАЕМЫЙ AI-провайдер в UI (пункт 2 из очереди Вадима). Пункт 1 (wizard) ЗАКРЫТ: c9ac973 (синхронный) → a767be9 (ASYNC job: submit 202 + poll, UI не виснет; submit проверен 38мс, cancel→cancelled вживую; ошибка моста = job.status failed с санитизированным message). Бэкенд async написал терминальный claude (opus соло), отревьюен. Гейт 255/255 unit + 5/5 media + build + smoke.
STATUS: IN_PROGRESS
LAST COMMIT: a767be9 async draft-job. До: c9ac973 wizard, research-sources, директор.
NEXT ACTION: UX-1 — вынести выбор draft-модели (chatgpt/gemini/deepseek/perplexity) в панель «Тема → видео»: (а) text-model.js — принимать model опцией, не только env; (б) draftBoardService/роут /draft — пробрасывать body.model; (в) GET /api/local-media/bridge → проксировать /health моста (какие провайдеры доступны); (г) UI-селект модели в wizard, заполняется из /bridge. Дефолт — deepseek (рабочий). Затем UX-2 BYOK-коннекторы генерации медиа, UX-3 оболочка (заставка/меню/Google-логин = P5).
ГРАБЛИ WIZARD/МОСТ: (1) РЕШЕНО async: reasoning-чаты думают МИНУТАМИ — теперь job, UI не висит. НО deepseek draft реально >5 мин (DeepThink) → нужен выбор быстрой модели (UX-1) ИЛИ BYOK-ключ (UX-2). (2) Дефолт модели в text-model.js = "chatgpt" (флаки); рабочая — deepseek. preview-харнесс НЕ подхватывает env из launch.json (для реального npm run dev — env вручную ИЛИ передавать model из UI после UX-1). (3) Мост залипает (провайдер держит lock) — рестарт: `pkill -f bridge-server; cd ~/ai-dev-station/workspace/browser-ai-bridge && setsid nohup node src/bridge-server.mjs >> bridge-server.log 2>&1 < /dev/null &`. Мост :8788, 4 провайдера.
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
