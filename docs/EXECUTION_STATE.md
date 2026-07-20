# EXECUTION STATE — Hermest Board

> Единственный источник «где мы сейчас». Любой агент на команду «продолжи Hermest Board»
> читает этот файл → `git log -5 --oneline` → `git status --short` → продолжает с NEXT ACTION.
> Протокол непрерывности: `docs/MASTER_PLAN_2026-07-19.md`, раздел 8.6.
> Обновляется в начале каждой задачи и после каждого коммита. Это часть Definition of Done.

UPDATED: 2026-07-20 (Claude Fable 5, седьмая сессия)
ACTIVE PHASE: P2+ — премиум-моушн (директива Вадима «оживи существующий дизайн», приоритет над P3)
ACTIVE TASK: P3.2 ЗАКРЫТА живым E2E (тема → crossref-источники → DeepSeek-директор → 6/6 карточек с цитатами). Следующее: P3.5 wizard UI
STATUS: IN_PROGRESS
LAST COMMIT: см. git log — research-sources (headless claude второго аккаунта, отревьюено) + research-обогащение директора (sourceRefs только из канона) + устойчивый транспорт: мост requireJson (reasoning-чаты прячут stop-кнопку в паузах мышления — «стабильный» огрызок ≠ финал), /v1 несёт system+options, node:http вместо undici-fetch (рвал ожидание на ~300s). Гейты: board 240/240 + 5/5, bridge 20/20
NEXT ACTION: P3.5 wizard UI: «тема → видео» одной кнопкой из борда (поле темы → draft через мост → карточки на доску → рендер). ГРАБЛИ ДЛЯ ДРАФТА: рабочая драфт-модель СЕЙЧАС — HERMEST_BRIDGE_MODEL=deepseek (DeepThink думает минутами — таймауты подняты до 420/480s); chatgpt (gpt-5-6-thinking) стабильно ОБРЫВАЕТСЯ на длинных ответах через мост — расследовать отдельно (вероятно SSE-обрыв на нестабильной сети); gemini прячет код-ответ ВНЕ .markdown (нужен селектор код-виджета). Мост: :8788, 4 провайдера, git локальный (remote = решение Вадима)
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
