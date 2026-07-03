# Hermest Board

Локальный интерактивный борд для записи обучающих видео про Hermest.

Открытие:

```bash
xdg-open /home/architect/ai-dev-station/workspace/hermest-board/index.html
```

Локальный dev-сервер:

```bash
npm install
npm run dev
```

Проверка перед деплоем:

```bash
npm run check
```

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
- озвучка сценария голосом браузера;
- авто-тур по карточкам;
- запись WebM через выбор окна в Chrome;
- подготовка publish pack для TikTok, YouTube, YouTube Shorts и Instagram Reels;
- очередь агента после генерации видео: парсер, переводчик, медиа-поиск, медиа-генерация, проверка прав, публикация и отчёт;
- экспорт публикационного пакета в JSON;
- Vercel API skeleton: health, connector status, publish-pack validation;
- public/free research API skeleton: Wikipedia, Crossref, arXiv, GitHub public search, optional OpenAlex;
- backend storage API contract: projects, assets, jobs, audit log, storage status;
- backend agent plan preview that shows blockers before autopublishing;
- per-user OAuth start skeleton for YouTube, TikTok, Instagram;
- режим записи;
- автосохранение в браузере;
- экспорт и импорт JSON.

Данные сохраняются в `localStorage` браузера. Для переноса используй кнопку экспорта JSON.

Автопубликация требует подключённых аккаунтов, постоянного backend-хранилища и OAuth/API-доступов. Пока коннекторы не подключены, борд готовит структурированный пакет публикации, backend-план агента и очередь действий.

Документы:

- `docs/DEPLOYMENT.md` - Vercel, Netlify, Docker, static hosting;
- `docs/ARCHITECTURE.md` - текущая архитектура и backend boundary;
- `docs/CONNECTORS.md` - что нужно для TikTok, YouTube, Shorts, Instagram;
- `docs/PUBLIC_APIS.md` - публичные/free API и правила безопасности;
- `docs/STORAGE_AND_AGENT_API.md` - проекты, assets, jobs, audit и backend agent plan;
- `docs/DATABASE_SCHEMA_DRAFT.md` - черновик Postgres-схемы для durable storage;
- `db/postgres-schema.sql` - SQL-черновик той же схемы;
- `docs/FABLE_ULTRACODE_MAXIMUM_UPGRADE_MANDATE.md` - professional maximum-upgrade brief for Fable 5 Ultracode;
- `docs/PRODUCT_READINESS.md` - что готово и что нужно до beta/launch.
