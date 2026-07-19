# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-19 (Claude Fable 5, пятая сессия)
ACTIVE PHASE: P2 — визуалы + звук
ACTIVE TASK: P2.2 КОД ЗАВЕРШЁН: FAL-адаптер (шаг 1, оборванный лимитом — дочищен и закоммичен 86afa0c) + интеграция в render-project (шаг 2): сцены без Pexels-клипа получают генерированный FLUX-фон со style-пресетом проекта (B3, дефолт в DEFAULT_STYLE_PRESET), бюджет 8 изображений/job, footage-провенанс (model+promptSha256 в манифесте), фолбэк-цепочка честная: broll видео → FAL фон → opaque кадр
STATUS: IN_PROGRESS
LAST COMMIT: см. git log — a25f6c9 security-фиксы независимого Kimi-ревью (2×P1: bounded streaming reads в FAL/Pexels/ElevenLabs адаптерах — OOM-вектор закрыт, общий src/media/bounded-body.js); гейт 198/198 unit + 4/4 media. Введён эстафетный протокол: MASTER_PLAN §8.6 п.7 + docs/NEXT_CLAUDE_MESSAGE.md (+Desktop-копия) — под конец лимитов КАЖДЫЙ агент переписывает сообщение следующему. Бесплатные ревью-агенты через OpenCode проверены и работают: deepseek-v4-flash-free, nemotron-3-ultra-free (`opencode run --auto -m opencode/<model> "…"`)
NEXT ACTION: P2.5 Ken Burns-дрейф статичных фонов/кадров (zoompan/crop-пан в composed-графе) ИЛИ P2.10 BYOK-UX (ключи через UI → локальный worker, запрос Вадима «чтобы люди сами вставляли API»); FAL live-smoke — как только Вадим пополнит баланс fal.ai (~$5): команда smoke уже отработана, код не трогать. ГРАБЛЯ: значения в ~/.secrets/env.sh в ОДИНАРНЫХ кавычках — только `source`, НЕ cut/tr (кавычка уезжает в ключ → ложный 401); референс-голоса: George JBFqnCBsd6RMkjVDRZzb · Alice Xb7hH8MSUJpSbSDYk0k2 · Aterna UX4FA7ZvSPh1ma6rI8P9 (кастомный Вадима)
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
