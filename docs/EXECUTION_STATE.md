# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-19 (Claude Fable 5, третья сессия, ультракод)
ACTIVE PHASE: P2 — визуалы + звук
ACTIVE TASK: P2 scene composer v1 ЗАВЕРШЁН (кадры уровня референса из ~/Загрузки/hermest-board-*-final-1080p.mp4); следующая задача — по выбору: P2.8 музыка+auto-ducking ИЛИ P2.5 Ken Burns-дрейф кадров ИЛИ P2.2 FAL-генерация фоновых изображений
STATUS: IN_PROGRESS
LAST COMMIT: см. git log — компоузер сцен: scene-markup.js (детерминированная брендированная разметка, XSS-safe) + scene-frames.js (headless Chrome, locked argv) + render-composed ffmpeg-путь + схемы манифеста + file:// редакция; гейт 172/172 unit + 3/3 media
NEXT ACTION: показать Вадиму COMPOSED-george-{16x9,9x16}.mp4; по его фидбеку — полировка разметки (варианты сцен-лейаутов) или следующая задача P2 (музыка P2.8 — самый заметный прирост качества); эталоны вида: ~/Загрузки/hermest-board-dmitry-v2-premium-1080p.mp4
UNCOMMITTED: none
BLOCKERS: (1) приёмка Вадимом: голос — elevenlabs-{george,alice,aterna}-ru.mp4 (выбрать «Дмитрия»/«Светлану»), видео — COMPOSED-george-{16x9,9x16}.mp4; (2) ключ ElevenLabs есть (free 10k симв/мес; ~1500 израсходовано); (3) ключ FAL.ai — только для P2.2 live-smoke, генерация фонов не блокирует композитный вид

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
