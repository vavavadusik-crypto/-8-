# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-21 (Claude Opus 4.8, восьмая сессия — Fable бережём, механику делает терминальный claude соло)
ACTIVE PHASE: P3 / UX — браузерные модели удобно в Hermest Board (директива Вадима 2026-07-21)
ACTIVE TASK: очередь Вадима 2026-07-21 (браузерные модели удобно в UI) — ВСЕ ТРИ ПУНКТА закрыты/проверены за сессию:
  ПУНКТ 1 wizard «тема→видео»: c9ac973 → a767be9 (async job, UI не виснет; submit 38мс, cancel→cancelled вживую).
  ПУНКТ 2 выбор ИИ-модели: 124b637 (селект из /bridge, 4 провайдера live, дефолт deepseek; model санитизирован allowlist + проброшен topic→draft→text-model). Гейт 261/261 unit + 5/5 media.
  ПУНКТ 3 BYOK медиа-ключи: УЖЕ РАБОТАЕТ (provider-keys пишет в process.env, медиа-адаптеры FAL/Pexels/ElevenLabs читают оттуда в том же worker-процессе). Проверено вживую: POST /providers/fal/key → source "session" → рендер использует. UI-панель byokProviders (set/clear) существует.
Весь бэкенд писал терминальный claude (opus, соло, --disallowed-tools Task), я ревьюил и интегрировал UI/проверял.
STATUS: IN_PROGRESS
LAST COMMIT: 124b637 выбор модели в wizard. До: a767be9 async draft, c9ac973 wizard.
NEXT ACTION: UX-2 РАСШИРЯЕМЫЕ коннекторы (запрос Вадима «добавлять СВОИ коннекторы» — генерация видео/звука/фото/света/фона): сейчас BYOK жёстко 3 провайдера (elevenlabs/fal/pexels в provider-keys.js PROVIDERS). Дать человеку добавлять произвольный коннектор (id+label+envVar/URL) через UI → provider-keys. Затем UX-3 оболочка приложения (заставка/меню/Google-регистрация/мультиустройство = P5 SaaS-ядро, нужен аккаунт Supabase — решение Вадима).
ГРАБЛЯ SW: public/sw.js КЭШИРУЕТ index.html — после правок UI юзер видит старую версию, пока не сбросит service worker (в превью лечил unregister+caches.delete+reload). Для SaaS на N устройств это критично — нужна стратегия обновления SW (versioned cache / skipWaiting). Кандидат в UX-3/P5.
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
