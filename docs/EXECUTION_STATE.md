# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-21 (Claude Opus 4.8, восьмая сессия — Fable бережём, механику делает терминальный claude соло)
ACTIVE PHASE: P3 / UX — браузерные модели удобно в Hermest Board (директива Вадима 2026-07-21)
ACTIVE TASK: P3.5 wizard «тема → видео» — ЗАКРЫТ КОДОМ (коммит c9ac973). UI-панель «Тема → видео» на доске + серверный роут POST /api/local-media/draft → src/local-media/draft-service.js (мост fail-closed, research fail-open). Бэкенд написал терминальный claude (opus, соло, --disallowed-tools Task), отревьюен мной. Гейт 246/246 unit + 5/5 media + build + smoke; панель рендерится в превью без ошибок. Живой E2E через deepseek — проверялся (см. NOTES).
STATUS: IN_PROGRESS
LAST COMMIT: c9ac973 wizard тема→board. До него: research-sources, research-обогащение директора, устойчивый транспорт моста.
NEXT ACTION: UX-1 — браузерный мост как ВЫБИРАЕМЫЙ AI-провайдер в UI рядом с BYOK-ключами (сейчас модель зашита env HERMEST_BRIDGE_MODEL; вынести выбор chatgpt/gemini/deepseek в панель, показывать /health моста). Затем UX-2 BYOK-маркетплейс коннекторов (ключи+коннекторы генерации медиа), UX-3 оболочка (заставка/меню/Google-регистрация → это P5 SaaS-ядро).
ГРАБЛИ WIZARD/МОСТ: (1) draft синхронный — reasoning-чаты (deepseek DeepThink, gpt-thinking) думают МИНУТАМИ, HTTP висит; кандидат на async-job как /render. (2) Дефолт модели в text-model.js = "chatgpt" (флаки, обрывается на длинных) — рабочая СЕЙЧАС deepseek; .claude/launch.json ставит HERMEST_BRIDGE_MODEL=deepseek, НО preview-харнесс env НЕ подхватил (для реального npm run dev — выставить env вручную). (3) Мост иногда залипает (провайдер «думает» и держит lock) — лечится рестартом: `pkill -f bridge-server; setsid nohup node src/bridge-server.mjs &`. Мост :8788, 4 провайдера.
UNCOMMITTED: none (docs — этот коммит)
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
