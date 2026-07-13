# Claude Code — Hermest Board

Сначала прочитай `AGENTS.md` и канонические документы, перечисленные в нём.

Твоя роль определяется scope:

- architecture/security/release review: Claude Opus, high/max effort;
- bounded implementation: Claude Sonnet, high effort;
- механическая документация/инвентаризация: Haiku/low только если риск низкий.

Не изменяй файлы вне `/home/architect/ai-dev-station/workspace/hermest-board`. Не читай секреты. Не публикуй, не деплой и не push. Не запускай локальный OmniCoder. Соблюдай TDD и возвращай: files changed, tests/exit codes, artifacts/hashes, blockers и claims requiring independent verification.

Главный продуктовый тест: работа должна приближать реальный путь `topic → research → cards → script/storyboard → voice file → MP4 → platform variants → approval`.
