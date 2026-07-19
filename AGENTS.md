# Hermest Board — локальные правила для агентов

## Единственная активная цель

Hermest Board — самостоятельный AI-конвейер контента:

```text
тема → вопросы AI → research/source cards → fact cards → сценарий → раскадровка
→ изображения/медиа → реальная озвучка → реальный MP4 → варианты платформ
→ точное одобрение пользователя → publish pack / официальная публикация → аналитика
```

Доска, карточки и agent jobs — средства производства. Конечная ценность — проверенный медиа-артефакт, а не план или красивый dashboard.

## Канонические документы

Перед работой прочитать по порядку:

0. `docs/EXECUTION_STATE.md` — где мы сейчас (ЧИТАТЬ ПЕРВЫМ при возобновлении)
0b. `docs/MASTER_PLAN_2026-07-19.md` — порядок работ и приоритеты (P0–P7)
1. `docs/PRODUCT_NORTH_STAR.md`
2. `docs/DELIVERY_MASTER_PLAN.md`
3. `docs/CONTENT_PIPELINE_SPEC.md`
4. `docs/MEDIA_RENDERING_ARCHITECTURE.md`
5. `docs/AGENT_ORCHESTRATION.md`
6. `docs/MODEL_ROUTING.md`
7. `docs/TECHNOLOGY_RADAR.md`
8. `docs/RELEASE_READINESS.md`
9. `docs/SECURITY_REVIEW.md`

Старые roadmap/handoff документы сохраняют историю, но не могут переопределять North Star.

## Инженерный контракт

- Работать вертикальными TDD-срезами: failing test → minimal implementation → full gate.
- Не называть экранную запись настоящим render pipeline.
- Не называть браузерное воспроизведение настоящим audio artifact.
- Не называть план агента исполненной job.
- Не называть publish pack автопубликацией.
- Не принимать self-report worker без проверки файлов, exit codes, ffprobe и тестов.
- Не переписывать рабочий UI/framework до characterization tests.
- Не смешивать два независимых feature scope в одном коммите.

Канонический локальный gate:

```bash
npm run check
```

Для media-среза дополнительно обязательны fixture render, `ffprobe` и manifest/hash checks.

## Безопасность

- Не читать и не выводить `.env`, auth/token stores, browser profiles или значения credentials.
- Не коммитить `.env`, `.data`, `dist`, `tmp`, media outputs, provider responses с private data.
- Любой imported board, URL, provider response и media file недоверенный.
- `git push origin` разрешён и ОБЯЗАТЕЛЕН после каждой завершённой задачи (standing-одобрение Вадима 2026-07-19, протокол непрерывности — MASTER_PLAN §8.6); force-push запрещён. Deploy на Vercel происходит автоматически с main. Никакой публикации в соцсети/OAuth-операций без явного одобрения Вадима.
- Approval должен быть привязан к exact artifact hash, caption, account, visibility и schedule.
- Public writes остаются fail-closed до durable storage/auth/authorization.
- Локальный OmniCoder запрещён.
- Не изменять Hermest Agent, AI Dev Station, HermestOS, Odysseus или другие продукты из Board-задачи.

## Agent policy

Sol — единственный главный оркестратор. Claude Code обязателен как независимый architecture/code/security участник, когда CLI авторизован. Другие workers получают непересекающиеся scopes и возвращают проверяемый handoff. Лимит/timeout — resumable checkpoint, не success.
