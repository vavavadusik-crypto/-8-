# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-19 (Claude Fable 5, вторая сессия)
ACTIVE PHASE: P1 — мультиязычный голос (русский первым)
ACTIVE TASK: P1.5 Audio normalization (loudnorm-замер в manifest QC)
STATUS: IN_PROGRESS
LAST COMMIT: см. git log — P1.1–P1.4 ЗАКРЫТЫ (ADR-001; Piper установлен+детерминизм+канонизация 48kHz; ElevenLabs BYOK; пер-сценный timeline: сцена = измеренная реплика + 400ms, wav-concat.js, SRT от речи); гейт 146/146 unit + 2/2 media
NEXT ACTION: P1.5 — loudnorm уже применяется в MP4-рендере (-af loudnorm I=-16); осталось ЗАМЕРИТЬ фактическую громкость результата (ffmpeg loudnorm print_format=json / astats) и зафиксировать отчёт в manifest.qc → RED-тест: манифест без loudness-замера не собирается для рендера с аудио
UNCOMMITTED: none
BLOCKERS: (1) ключ ElevenLabs у Вадима — только для опционального live-smoke P1.3, разработка не блокирована; (2) субъективная приёмка голоса Вадимом: слушать ~/Видео/hermest-board-voice-samples/ (dmitri/irina/en)

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
