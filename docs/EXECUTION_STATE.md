# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-19 (Claude Fable 5, третья сессия, ультракод)
ACTIVE PHASE: P1→P2 переход
ACTIVE TASK: P2.1 ADR image-провайдеров; параллельно в фоне — адверсариальное ревью P1-диффа (43bd6c8..266efd6)
STATUS: IN_PROGRESS
LAST COMMIT: см. git log — P1 закрыта кодом; P1.3 live-smoke ElevenLabs ЗАКРЫТ живым ключом (3 продуктовых рендера RU-фикстуры: George/Alice/Aterna, ffprobe-valid, утечек ключа 0, квота 750/10000)
NEXT ACTION: P2.1 — docs/adr/ADR-002-image-providers.md (FAL FLUX schnell/dev = основной BYOK; Stability/Replicate = fallback; Wikimedia Commons + Openverse/Pexels = бесплатный сток) → затем P2.2 FAL-адаптер в capability router (style-пресет проекта, B3) по TDD; при завершении фонового ревью — все confirmed-находки фиксятся RED→GREEN до мержа P2-кода
UNCOMMITTED: none
BLOCKERS: (1) ГЛАВНЫЙ: Вадим забраковал Piper-голоса («отстой») — Piper остаётся free/offline-уровнем, релизный голос = ElevenLabs; ждём прослушку ~/Видео/hermest-board-voice-samples/elevenlabs-{george,alice,aterna}-ru.mp4 и выбор голосов «Дмитрий»/«Светлана»; (2) ключ ElevenLabs есть (free 10k символов/мес, ~/.secrets/env.sh: ELEVENLABS_API_KEY → адаптеру нужен HERMEST_ELEVENLABS_API_KEY); (3) ключ FAL.ai (~$5–10) понадобится для live-smoke P2.2, mock-TDD не блокирован

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
