# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-19 (Claude Fable 5, третья сессия, ультракод)
ACTIVE PHASE: P2 — визуалы + звук
ACTIVE TASK: P2 b-roll порт ЗАВЕРШЁН (ADR-003: Pexels-адаптер + overlay-кадры + footage-провенанс в манифесте); композитный вид принят Вадимом («карточки красиво обыграны — супер»), требование «фоновое видео по теме» реализовано кодом, ждёт живого ключа Pexels
STATUS: IN_PROGRESS
LAST COMMIT: см. git log — b-roll: broll-source.js (Pexels, mock-TDD), scene-markup overlay-режим, transparent Chrome, расширенный render-composed (stream_loop+overlay, посегментная валидация фильтра), manifest.footage (license fail-closed); гейт 179/179 unit + 3/3 media
NEXT ACTION: как появится HERMEST_PEXELS_API_KEY (бесплатная регистрация https://www.pexels.com/api/ → ключ в ~/.secrets/env.sh) — live-smoke: RU-демо с реальным стоковым видеофоном → сэмпл Вадиму; параллельно следующая задача P2.8 музыка+auto-ducking (самый заметный прирост качества)
UNCOMMITTED: none
BLOCKERS: (1) БЕСПЛАТНЫЙ ключ Pexels от Вадима — оживляет видеофоны (код готов); (2) выбор голосов Вадимом: george/alice/aterna → «Дмитрий»/«Светлана»; (3) ключ FAL.ai — премиум-генерация фонов/видео (LTX/WAN), не блокирует

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
