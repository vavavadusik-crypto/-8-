# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-19 (Claude Fable 5, четвёртая сессия)
ACTIVE PHASE: P2 — визуалы + звук
ACTIVE TASK: P2.8 музыка+auto-ducking ЗАВЕРШЕНА: music-library порт (assets/music, CC0, fail-closed license), sidechaincompress-микс в composed-рендере, music-провенанс в manifest + QC music_bed_ducking, переключатель «Музыка» в UI (brief.music: ""=авто/"off"), ducking-тест в медиа-гейте; b-roll порт тоже закоммичен и запушен ранее этой сессией
STATUS: IN_PROGRESS
LAST COMMIT: см. git log — music bed: обнаружен и устранён недетерминизм sidechaincompress/loudnorm под threaded-скедулером ffmpeg 8 (asetnsamples=n=1024 на входах) — 4/4 идентичных рендера; гейт 188/188 unit + 4/4 media
NEXT ACTION: следующая задача P2 — P2.2 FAL-адаптер (нужен ключ, BLOCKED) или P2.9 стоковый фолбэк без ключей (Openverse/Commons, можно без ключа); при появлении HERMEST_PEXELS_API_KEY — live-smoke RU-демо с видеофоном+музыкой → сэмпл Вадиму
UNCOMMITTED: none
BLOCKERS: (1) БЕСПЛАТНЫЙ ключ Pexels от Вадима — оживляет видеофоны (код готов); (2) выбор голосов Вадимом: george/alice/aterna → «Дмитрий»/«Светлана»; (3) ключ FAL.ai — премиум-генерация визуалов, блокирует P2.2; (4) прослушивание музыкальной подложки Вадимом (стартовый трек — процедурный ambient, можно докинуть CC0-треки в assets/music)

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
