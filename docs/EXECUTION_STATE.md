# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-22 (девятая сессия — параллельные полосы: я=frontend/UX интегратор, терминальный claude=backend/runtime)
ACTIVE PHASE: RC / UX — довести до release-candidate, которым человек пользуется локально без костылей (директива Вадима 2026-07-22)

## Параллельные полосы 2026-07-22 (директива Вадима: использовать И терминального claude)
Контракт границ: docs/INTEGRATION_HANDOFF.md. Правило: локальные LLM (Ollama) не запускать; push запрещён (переопределяет standing-approval).
- ПОЛОСА A (я, ветка integrator/ux-release-candidate): frontend/product UX.
  ✅ Онбординг + заметный вход в главный сценарий. Коммиты 1cfa6bb (handoff), cc996f6 (UX).
     Новый пользователь: первый-запуск оверлей «Из темы — в готовое видео» (тема→сразу в wizard) + шапка-CTA «🎬 Тема→видео»
     (открывает панель, префилл+фокус wizard). localStorage-gated. Проверено вживую в превью: оверлей show/dismiss/persist,
     CTA открывает+префиллит+фокусит, мобайл 375px без переполнений, validate ok, консоль чистая. Скриншот-рендерер превью
     таймаутит (проблема инструмента, не приложения).
- ПОЛОСА B (терминальный claude, worktree ../hermest-board-backend, ветка feat/backend-runtime): backend/runtime robustness. ✅ ЗАВЕРШЕНО.
     4 коммита (bc1b894 error-envelope, 8d359bc input-validation 400, 7ebf23a fail-closed мост+стрим, 871342f sanitize warnings),
     +16 unit (272→288), только backend-файлы. Закрыл крашер: createReadStream().pipe() без error-handler ронял весь vite dev-server.
- ✅ ИНТЕГРАЦИЯ (я): merge a50f42d (feat/backend-runtime → integrator/ux-release-candidate, disjoint files, 0 конфликтов).
     Фронт-контракт цел: fetchJson читает data.error (строка), code лёг в error.payload аддитивно.
     ПОЛНЫЙ ГЕЙТ `npm run check` → exit 0: validate · 288 unit · smoke:api · 5 media (реальный FFmpeg) · build · render smoke.
     Живой интеграционный smoke: консоль чистая, CTA/онбординг/BYOK(10 опц.)/render-worker готовы, 21 карточка. Push НЕ делал (директива).
     Worktree ../hermest-board-backend оставлен для следующей backend-порции терминального claude.
ACTIVE TASK: очередь Вадима 2026-07-21 (браузерные модели удобно в UI) — ВСЕ ТРИ ПУНКТА закрыты/проверены за сессию:
  ПУНКТ 1 wizard «тема→видео»: c9ac973 → a767be9 (async job, UI не виснет; submit 38мс, cancel→cancelled вживую).
  ПУНКТ 2 выбор ИИ-модели: 124b637 (селект из /bridge, 4 провайдера live, дефолт deepseek; model санитизирован allowlist + проброшен topic→draft→text-model). Гейт 261/261 unit + 5/5 media.
  ПУНКТ 3 BYOK медиа-ключи: УЖЕ РАБОТАЕТ (provider-keys пишет в process.env, медиа-адаптеры FAL/Pexels/ElevenLabs читают оттуда в том же worker-процессе). Проверено вживую: POST /providers/fal/key → source "session" → рендер использует. UI-панель byokProviders (set/clear) существует.
Весь бэкенд писал терминальный claude (opus, соло, --disallowed-tools Task), я ревьюил и интегрировал UI/проверял.
STATUS: IN_PROGRESS
LAST COMMIT: 124b637 выбор модели в wizard. До: a767be9 async draft, c9ac973 wizard.
ПРОДОЛЖЕНИЕ 2026-07-21 (та же сессия):
  SW ГРАБЛЯ ИСПРАВЛЕНА: fdd7437 (network-first для HTML) → 0c63ae5 (cache-first ТОЛЬКО для /assets/, всё прочее network-first; версия v3). Причина: cache-first на всё кэшировал и index.html, и dev-модули /src/app.js. Проверено вживую: свежий UI отдаётся через SW, старый кэш удаляется.
  UX-2 текстовый BYOK ЗАКРЫТ: 8c86be3. Wizard может драфтить через ЛЮБОЙ OpenAI-совместимый API — пресеты (OpenRouter/Groq/Together/DeepSeek-API/Mistral/HuggingFace/OpenAI/Ollama) или свой URL + ключ. src/media/openai-text-model.js (SSRF-guard: удалённый только https, http лишь localhost; ключ не в логах/ошибках; header-injection guard; bounded). draft-service выбирает bridge vs openai; для openai мост НЕ нужен. ЖИВОЙ E2E через локальный Ollama (kimi-k2.7-code:cloud): реальный борд «Зачем нужен сон» 3 карточки за ~6с, БЕЗ моста, БЕЗ ключа — и в разы быстрее reasoning-моста. Гейт 269/269 unit + 5/5 media. Ключ безопасен: draft-job держит params только в замыкании.
ПРОДОЛЖЕНИЕ 2026-07-22 (ночь, автономно; лимиты обновлены):
  РЕШЕНИЕ Вадима: развилка → UX-2-медиа (BYOK/бесплатная генерация картинок/звука). Правила те же: терминальный claude (Opus 4.8 ultracode, соло, --disallowed-tools Task) + Ollama/OpenCode; я — без субагентов/workflow.
  ГРАБЛЯ HuggingFace image: HF УБРАЛ бесплатную serverless-генерацию картинок — api-inference.huggingface.co МЁРТВ (http 000), router hf-inference → 410/«model deprecated/not supported», через платных провайдеров → 402 (нужны кредиты). Адаптер делегата бил в мёртвый эндпоинт → ОТКАЧЕН (никогда не коммитился). HF ценен ТОЛЬКО как текстовый провайдер (router.huggingface.co/v1/chat жив, 200 — уже в text-BYOK пресетах).
  РАЗВОРОТ: настоящий бесплатный image-API БЕЗ КЛЮЧА — Pollinations (image.pollinations.ai/prompt/<enc>?width&height&seed&nologo&model=flux). Проверено вживую: реальный JPEG 1024×576, релевантный промпту. Адаптер пишется (делегат), встраивается в каскад FAL→Pollinations(всегда)→Pexels; availability станет ВСЕГДА executable (генерация без ключей).
  Piper HOME-фикс (os.userInfo().homedir вместо os.homedir(), устойчивость к agent-scoped HOME) — отдельный коммит 53c17f7 (был scope-creep делегата, вынесен чисто).
  UX-2-МЕДИА (картинки) ЗАКРЫТ и проверен вживую:
    - cea5135: Pollinations-адаптер (бесплатно, без ключа) в каскаде FAL→Pollinations(всегда)→Pexels; генерация opt-in (brief.generateVisuals ИЛИ платный ключ), по умолчанию выкл → рендеры детерминированы и без сети (гейт не флакает). hasKeyedImageProvider() — новый экспорт.
    - 411344c: UI-тумблер «Генерировать фоны (бесплатно, Pollinations)» в панели рендера → brief.generateVisuals, persist. Проверено в превью.
    - ЖИВОЙ keyless-рендер: борд с generateVisuals:true → 2 сцены получили Pollinations-фоны (manifest footage provider=pollinations), MP4 1920×1080, кадр визуально подтверждён (горное озеро по промпту). Сэмпл Вадиму: ~/Видео/hermest-board-voice-samples/pollinations-free-visuals-1080p.mp4.
  ИТОГ медиа-BYOK: ТЕКСТ (директор) — любой OpenAI-совместимый (Ollama/OpenRouter/HF/… или свой ключ); КАРТИНКИ — Pollinations бесплатно + FAL BYOK; ГОЛОС — Piper бесплатно (отвергнут) + ElevenLabs BYOK (ключ есть); МУЗЫКА — процедурная бесплатно. Все медиатипы имеют бесплатный И BYOK путь.
ЦЕЛЬ Вадима 2026-07-22: довести до release-ready продукта (11 критериев). Правило усилено: ВЕСЬ код/доки пишет терминальный claude (Opus soло, --disallowed-tools Task), я — оркестратор/ревью/проверка.
  АУДИТ: гейт зелёный (272 unit + 5 media + build + smoke); дерево чистое; продукт функционален и проверен вживую. Гэпы были: README устарел, engines не задан, Docker без .dockerignore, release-пакет отсутствовал.
  Этап A (7cb5501): README актуализирован под все фичи + engines.node. Этап C (9b153d1): .dockerignore + Dockerfile npm ci; Docker-образ СОБРАН и проверен (HTTP 200, отдаёт SPA) — критерий 5. Демо полного стека (Ollama→ElevenLabs George→Pexels→анимация, 64с, loudness −16.5) в ~/Видео/hermest-board-voice-samples/full-stack-demo-ocean-george-1080p.mp4.
  Этап E (в работе, делегат): scripts/build-release.mjs + SHA-256 manifest dist + docs/RELEASE_STATUS.md + HANDOFF/RELEASE_READINESS синк — критерии 10/11.
  RELEASE v0.3.0 ВЫПУЩЕН (тег v0.3.0, запушен). Все 11 критериев Вадима выполнены фактически (не заявлением):
    установка/запуск по докам ✓ · UI без критич.ошибок ✓ · запросы к AI (wizard→Ollama live E2E, мост 4 провайдера) ✓ ·
    состояние/восстановление ✓ · Docker собран+отдаёт SPA HTTP200 ✓ · сценарии вручную+тесты (272 unit+5 media) ✓ ·
    нет секретов в коде/мёртвого веса (source-zip обновлён) ✓ · fail-open провайдеров ✓ · чистый модульный код ✓ ·
    docs актуальны (README/RELEASE_STATUS/handoff/CHANGELOG@0.3.0) ✓ · release package + SHA-256 manifest (build-release.mjs) ✓.
    Артефакт релиза: dist/RELEASE_MANIFEST.sha256 (version 0.3.0, детерминированный). Статус-отчёт: docs/RELEASE_STATUS.md.
    ВСЁ писал терминальный claude (Opus соло, --disallowed-tools Task); я — оркестратор/ревью/живые проверки. Fable не трогал.
STATUS: RELEASE_READY (v0.3.0)
LAST COMMIT: 4461d30 release 0.3.0 + тег v0.3.0. Осн. release-коммиты: 7cb5501 README, 9b153d1 Docker, c451989 release-tooling, b417389 source-zip.
NEXT ACTION (после релиза, требует решений Вадима): UX-3 оболочка/Google-логин на Supabase (creds Вадима); либо продуктовый хвост P3+ (semantic shorts, editions, шаблоны). Мост :8788; Ollama :11434.
NEXT ACTION: варианты (Вадим спит, автономно): (1) полный free-stack E2E демо-ролик (Ollama-директор → Pollinations-фоны → ElevenLabs George → премиум-анимация) как showcase + интеграционное доказательство; (2) UX-3 оболочка (заставка/меню/Google-логин/Supabase) — ЗАБЛОКИРОВАНО: нужны Supabase creds Вадима (URL+anon+service key), без них не начинать. HF-image мёртв (не возрождать). Мост :8788; Ollama :11434 (модель kimi-k2.7-code:cloud).
NEXT ACTION (развилка, спросил Вадима): (A) UX-2-медиа — BYOK-коннекторы генерации ИЗОБРАЖЕНИЙ/ЗВУКА (HuggingFace/Replicate для картинок, доп. TTS) по образцу openai-text-model, + произвольный коннектор через UI; ИЛИ (B) UX-3 оболочка — заставка/меню/Google-регистрация/мультиустройство на Supabase (аккаунт ЕСТЬ у Вадима) = P5 SaaS-ядро, самый крупный кусок. Текстовый director-BYOK — самый частый провайдер, уже даёт максимум рычага, поэтому сделан первым.
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
