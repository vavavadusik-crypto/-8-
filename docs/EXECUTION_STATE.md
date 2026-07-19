# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-19 (Claude Fable 5, пятая сессия)
ACTIVE PHASE: P2 — визуалы + звук
ACTIVE TASK: P3.1 Production brief + AI Director вопросы (кодовая часть P2 ИСЧЕРПАНА: P2.1–P2.10 закрыты; гейт фазы P2 ждёт только приёмки Вадима — голос/визуал/музыка + FAL-баланс)
STATUS: IN_PROGRESS
LAST COMMIT: см. git log — P2.3 кэш ассетов ЗАКРЫТ: sha256-ключ (provider+model+style+prompt+size+seed) → ~/.cache/hermest-board/generated-images (override HERMEST_ASSET_CACHE_DIR); повторный рендер = 0 платных генераций (counting-mock тест); hit = байт-идентичный результат (детерминизм манифестов); integrity-check с eviction; fail-open с warning. До него: P2.10 BYOK-UX, P2.5 Ken Burns. Гейт 213/213 unit + 5/5 media
NEXT ACTION: P3.1 — тема → 3–5 уточняющих вопросов с дефолтами (аудитория, длительность, тон, язык, платформы); можно пропустить — идут дефолты; unit: brief-схема валидируется. Начать с чтения docs/CONTENT_PIPELINE_SPEC.md и src/domain/ (где живёт схема brief). FAL live-smoke — как только Вадим пополнит fal.ai (~$5). ГРАБЛИ: ~/.secrets/env.sh — только `source`, НЕ cut/tr; loudnorm на anullsrc → NaN (в тестах — тихий sine); референс-голоса: George JBFqnCBsd6RMkjVDRZzb · Alice Xb7hH8MSUJpSbSDYk0k2 · Aterna UX4FA7ZvSPh1ma6rI8P9
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
