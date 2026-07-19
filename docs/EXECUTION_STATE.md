# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-19 (Claude Fable 5, вторая сессия)
ACTIVE PHASE: P1 — мультиязычный голос (русский первым)
ACTIVE TASK: P1.6 Выбор языка и голоса в UI (селектор языка проекта + голоса/провайдера на доске)
STATUS: IN_PROGRESS
LAST COMMIT: см. git log — P1.1–P1.5 ЗАКРЫТЫ (ADR-001; Piper; ElevenLabs BYOK; пер-сценный timeline; loudness-замер в manifest.qc.loudness); гейт 152/152 unit + 2/2 media
NEXT ACTION: P1.6 — найти в src/app.js место project.brief (language/voice/narrationProvider) → UI-селектор языка (RU/EN/ES/DE/FR + «любой через ElevenLabs BYOK») и голоса; статус executable из каталога голосов; browser smoke: выбор языка+голоса → рендер с ним. Затем P1.7 (RU-фикстура в гейт) и P1.8 (language lineage в manifest — частично готово: tools.tts уже несёт language/voice/provider, проверить и дописать тест)
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
