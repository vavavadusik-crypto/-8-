# Hermest Board — Product North Star

Дата фиксации: 2026-07-13
Владелец продукта: Вадим
Статус: CURRENT AUTHORITY / PRODUCT DECISION

## 1. Определение

Hermest Board — самостоятельная AI-студия и конвейер производства/дистрибуции контента. Пользователь задаёт тему обычным языком; Board уточняет только важные неизвестные, исследует источники, строит связанные карточки, сценарий и раскадровку, создаёт медиа и реальную озвучку, рендерит настоящее видео, адаптирует его под площадки и после точного human approval публикует разрешённым официальным способом.

Board не является generic Kanban, интерфейсом личного Hermest Agent или витриной agent statuses. Эти механизмы допустимы только как внутренние средства конвейера.

## 2. Обещание пользователю

Из одного понятного задания пользователь получает:

1. вопросы, влияющие на результат;
2. исследование с источниками и отделением факта от предположения;
3. визуальный набор редактируемых карточек;
4. структурированный сценарий и раскадровку;
5. изображения/видео с provenance и rights status;
6. реальный voice/audio artifact;
7. реальный master video artifact;
8. осмысленные версии для YouTube, Shorts, TikTok и Reels;
9. preview и approval exact candidate;
10. publish pack, inbox/private или public publication согласно реальной platform readiness;
11. статусы и аналитику, превращающиеся в идеи следующего выпуска.

## 3. Режим AI Director

AI использует defaults и спрашивает только high-impact параметры:

- аудитория и язык;
- цель/жанр/тон;
- фактическая строгость и допустимые источники;
- master duration и площадки;
- визуальный стиль и правила генеративных изображений;
- голос, темп и pronunciation notes;
- права/brand restrictions;
- CTA, visibility и schedule.

Все inferred defaults видимы и редактируемы. Неизвестные права, факты или platform permissions не превращаются в уверенное `ready`.

## 4. Карточки как production intermediate representation

Минимальные типы:

- `topic`, `question`, `source`, `fact`, `angle`;
- `scene`, `script_segment`, `visual`, `voice`, `music`, `subtitle`;
- `asset`, `cut`, `publish_candidate`, `metric`, `follow_up`.

Связи сохраняют lineage: source → fact → claim → scene → asset → output. Карточка сцены содержит narrative text, duration, visual direction, source refs, asset refs, voice/subtitle state и readiness blockers.

## 5. Platform adaptation

Один master не режется механически. Variant recipe может менять:

- aspect ratio/resolution/safe zones;
- hook и CTA;
- semantic segment boundaries;
- pace и pauses;
- title/caption/hashtags;
- subtitle size/layout;
- cover/thumbnail;
- duration и episode numbering.

Platform constraints — versioned data, а не вечные константы в UI.

## 6. Human approval

Публикация является необратимым side effect. Approval связывается с exact:

- video/audio/subtitle/cover hashes;
- caption/title/hashtags;
- connector/account;
- visibility и schedule;
- policy/recipe versions.

Любое изменение инвалидирует approval. До platform review Board обязан предлагать честный level-0 publish pack или level-1 inbox/private flow.

## 7. Product boundaries

Board владеет content domain, media pipeline, assets, jobs, approvals, connectors, publishing и analytics. Он работает независимо от домашнего Hermest Agent и KINGSTON. Опциональный local-agent handoff возможен позже по versioned contract, но не является обязательным backend.

## 8. Не-цели ближайшего релиза

- новый general-purpose agent runtime;
- собственная операционная система;
- бесконтрольный autonomous social spam;
- физическое копирование внешних agent repos;
- microservices без измеренной причины;
- framework rewrite ради моды;
- обещание public autopublish до OAuth/app review.

## 9. Минимальный доказательный релиз

Минимум считается достигнутым, когда фиксированный board/project fixture и пользовательский board JSON проходят реальный путь:

```text
validated board → deterministic storyboard → narration audio file
→ subtitle file → 16:9 MP4 → 9:16 MP4 → manifest + hashes → local preview/approval
```

`ffprobe` обязан подтвердить video+audio streams, ненулевую duration и ожидаемые dimensions. Browser speech и screen capture не закрывают этот критерий.
