# Milestone M2 — Free provider-neutral B-roll pipeline (PHASE 2)

Ответ на конкурента InMedia («AI video»): даём то же, но **бесплатно, локально, приватно и с реальным provenance**, без ложного «text-to-video».

## Контракт (закрыто)

- **Unified provider contract** — `src/media/broll-providers.js`: реестр провайдеров, у каждого `{ id, kind, costClass: free|byok, describeAvailability, timeout, retry, cancellation (AbortSignal), contentType, provenance }`. `buildCascade(mode)` собирает цепочку под режим.
- **Режимы** (`VALID_BROLL_MODES`, `render-project.js`): `auto` (бесплатно, приоритет) · `free` (только бесплатно/локально) · `premium` (разрешить BYOK) · `deterministic` (только композиция, офлайн). Дефолт `auto`.
- **Fail-open каскад**: generative-image → stock-footage → deterministic. Падение провайдера = honest warning + переход дальше, рендер не роняется. Каждая сцена без футажа получает `deterministic`-entry — **provenance у каждой сцены**.
- **assetType** ∈ `stock-footage | generated-image | deterministic` в `manifest.footage[]`.
- **Безопасность**: MP4 magic-byte (`video-validation.js`), safe generated paths, байт-капы, квоты (`MAX_GENERATED_BACKGROUNDS`), таймауты.
- **UI** (`index.html` + `src/app.js`): селектор «Фон сцен (B-roll)» с 4 режимами, честная подпись «монтаж сцен, не text-to-video»; `brollMode` в brief → `normalizeBrief` (валидация/фолбэк auto) → долетает до бэкенда через `buildProjectDocument().brief`.

## Полосы и коммиты

- Backend (терминальный claude): `broll-providers.js`, каскад в `render-project.js`, `video-validation.js`, `manifest.footage[].assetType`. Merge `601a646`.
- Frontend (Claude Fable 5 соло — терм. claude умер на обрыве интернета `ENOTIMP`): селектор + brief-проводка + UI-тест. Merge `f87f3c5`.
- Hermetic-фикс гейта: env `HERMEST_BROLL_MODE` форсирует офлайн-режим в тесте (продуктовый дефолт auto/Pollinations сохранён). Реальный дефект: живой Pollinations давал недетерминированный warning → падало равенство манифестов.

## Gate M2

Полный `npm run check`: 383 unit / 0 · 6 media / 0 (реальный ffmpeg, вкл. «deterministic mode MP4 without external API calls» — бесплатный офлайн-путь) · build · smoke. Push НЕ делался.

## Честный гэп

Backend-аналитика (`job.analytics`) пока не отдаёт per-scene разбивку `assetType` — UI показывает реальный `footageCount`, а не сочинённую разбивку. Кандидат на backend-follow-up (добавить breakdown в `deriveRenderAnalytics`, затем UI-подписи).
