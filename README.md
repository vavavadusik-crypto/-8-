# Hermest Board

AI-конвейер контента: исследование и карточки → сценарий/раскадровка → озвучка → настоящее видео → варианты платформ → approval/publishing.

Локальный browser board остаётся творческим control plane; R1 media worker уже умеет детерминированно собирать реальные MP4 через FFmpeg.

Открытие:

```bash
xdg-open /home/architect/ai-dev-station/workspace/hermest-board/index.html
```

Локальный dev-сервер:

```bash
npm install
npm run dev
```

Проверка перед checkpoint/deploy (включает реальный FFmpeg render integration):

```bash
npm run check
```

Локальная сборка настоящего видео из board JSON:

```bash
npm run render:project -- \
  --input test/fixtures/minimal-board.json \
  --platform youtube_video

npm run render:project -- \
  --input test/fixtures/minimal-board.json \
  --platform youtube_shorts
```

Каждый запуск создаёт приватный уникальный каталог под `tmp/` и возвращает MP4 H.264/AAC, `narration.wav`, SRT, `storyboard.json`, детерминированный manifest и SHA-256 sidecar. Встроенный Flite — только no-key/offline smoke voice; для качественной русской озвучки нужен следующий provider adapter.

Возможности:

- перетаскивание карточек;
- изменение размера карточек;
- прикрепление фото к каждой карточке;
- редактирование текста прямо в карточке;
- поворот карточек;
- масштаб и панорамирование всей сцены;
- связи между карточками;
- удаление карточки прямо с карточки;
- встроенные тематические визуалы для стартовых карточек;
- прикрепление плана проекта и roadmap;
- загрузка плана и roadmap из `.md`, `.txt` или `.json`;
- сборка сценария из борда, плана и roadmap;
- preview-озвучка сценария голосом браузера;
- детерминированная локальная R1-озвучка в WAV через TTS adapter (Flite offline smoke fallback);
- настоящий FFmpeg render в H.264/AAC MP4 с SRT, storyboard, manifest и SHA-256;
- реальные 16:9 и 9:16 output recipes; semantic short editing честно остаётся blocker следующего среза;
- авто-тур по карточкам;
- legacy browser screen recording WebM для демонстраций, не считающееся media renderer;
- подготовка publish pack для TikTok, YouTube, YouTube Shorts и Instagram Reels;
- очередь агента после генерации видео: парсер, переводчик, медиа-поиск, медиа-генерация, проверка прав, публикация и отчёт;
- экспорт публикационного пакета в JSON;
- Vercel API skeleton: health, connector status, publish-pack validation;
- public/free research API: Wikipedia, Wikidata, Wikimedia Commons, Crossref, arXiv, Open Library, GitHub public search, optional OpenAlex;
- backend storage API contract: projects, assets, jobs, audit log, storage status;
- guarded Postgres JSONB adapter foundation for future durable storage;
- signed-session verification and owner-token bootstrap issuer foundation;
- account-auth foundation with signup/login/logout routes, scrypt password hashing, and httpOnly signed session cookies when explicitly enabled by server env;
- backend production preflight route for readiness gates and blockers;
- in-board `1.0 статус` report powered by backend preflight gates/blockers;
- backend agent plan preview that shows blockers before autopublishing;
- human approval record endpoint for publish jobs;
- Settings button inside the board for user-owned OpenAI keys and future local parser/media/translation/workflow keys;
- API provider catalog with 40+ AI, search, media, speech, social, automation, storage, email, and payment providers;
- BYOK AI response proxy and AI-answer cards for OpenAI plus OpenAI-compatible providers such as Groq, Mistral, OpenRouter, DeepSeek, and Together AI;
- per-user OAuth start skeleton for YouTube, TikTok, Instagram;
- signed OAuth state validation before connector token exchange;
- encrypted connector token vault with redacted API responses;
- режим записи;
- автосохранение в браузере;
- экспорт и импорт JSON.

Данные сохраняются в `localStorage` браузера. Для переноса используй кнопку экспорта JSON.

Автопубликация требует подключённых аккаунтов, постоянного backend-хранилища и OAuth/API-доступов. Пока коннекторы не подключены, борд готовит структурированный пакет публикации, backend-план агента и очередь действий.

Документы:

- `docs/PRODUCT_NORTH_STAR.md` - каноническое определение продукта и минимальный доказательный релиз;
- `docs/DELIVERY_MASTER_PLAN.md` - текущий порядок вертикальных релизов и Definition of Done;
- `docs/CONTENT_PIPELINE_SPEC.md` - pipeline, cards, storyboard, assets и quality gates;
- `docs/MEDIA_RENDERING_ARCHITECTURE.md` - реальная TTS/FFmpeg/worker граница;
- `docs/AGENT_ORCHESTRATION.md` - scopes, checkpoints, Claude Code и review policy;
- `docs/MODEL_ROUTING.md` - role-based модели, fallback, quota и eval policy;
- `docs/TECHNOLOGY_RADAR.md` - adopt/adapter/study/reject решения по open-source компонентам;
- `docs/RELEASE_READINESS.md` - текущий доказательный release ledger;
- `docs/DEPLOYMENT.md` - Vercel, Netlify, Docker, static hosting;
- `docs/ARCHITECTURE.md` - текущая архитектура и backend boundary;
- `docs/CONNECTORS.md` - что нужно для TikTok, YouTube, Shorts, Instagram;
- `docs/PUBLIC_APIS.md` - публичные/free API и правила безопасности;
- `docs/STORAGE_AND_AGENT_API.md` - проекты, assets, jobs, audit и backend agent plan;
- `docs/DATABASE_SCHEMA_DRAFT.md` - черновик Postgres-схемы для durable storage;
- `db/postgres-schema.sql` - SQL-черновик той же схемы;
- `docs/SECURITY_REVIEW.md` - текущий security baseline и блокеры до production writes/autopublishing;
- `docs/FABLE_ULTRACODE_MAXIMUM_UPGRADE_MANDATE.md` - professional maximum-upgrade brief for Fable 5 Ultracode;
- `docs/PRODUCT_READINESS.md` - что готово и что нужно до beta/launch.
- `SECURITY.md` - политика секретов, OAuth/API-ключей и production safety;
- `CHANGELOG.md` - история публичных изменений;
- `LICENSE` - текущий статус лицензии: all rights reserved до отдельного решения владельца.
