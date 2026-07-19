# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-19 (Claude Fable 5, пятая сессия)
ACTIVE PHASE: P2 — визуалы + звук
ACTIVE TASK: P2.2 FAL-адаптер — IN_PROGRESS, шаг 1: src/media/image-source.js (mock-TDD, sync endpoint fal.run/fal-ai/flux/schnell) + тесты; дальше style-пресет (B3) → интеграция в render-project → кэш (P2.3) → live-smoke
STATUS: IN_PROGRESS
LAST COMMIT: см. git log — fix transparent scene-frame schema; гейт 189/189 unit + 4/4 media
NEXT ACTION: P2.2 FAL-адаптер (ключ ЕСТЬ, разблокирована): адаптер по контракту capability router, style-пресет проекта (B3), live-smoke FLUX schnell (~$0.01, бюджет Вадима подтверждён передачей ключа); референс-голоса: George JBFqnCBsd6RMkjVDRZzb · Alice Xb7hH8MSUJpSbSDYk0k2 · Aterna UX4FA7ZvSPh1ma6rI8P9 (кастомный Вадима)
UNCOMMITTED: none
BLOCKERS: (1) Вадим слушает ru-fullstack-{aterna,george}.mp4 и выбирает release-голос (Piper отвергнут ранее — сэмплы ТОЛЬКО ElevenLabs); (2) прослушивание музыкальной подложки (процедурный ambient — можно докинуть CC0-треки в assets/music); ключи Pexels/FAL — ЗАКРЫТЫ

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
