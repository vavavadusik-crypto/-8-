# Claude Code — Hermest Board

Сначала прочитай `AGENTS.md` и канонические документы, перечисленные в нём.

Твоя роль определяется scope:

- architecture/security/release review: Claude Opus, high/max effort;
- bounded implementation: Claude Sonnet, high effort;
- механическая документация/инвентаризация: Haiku/low только если риск низкий.

Не изменяй файлы вне `/home/architect/ai-dev-station/workspace/hermest-board`. Не читай секреты. Не публикуй в соцсети и не трогай OAuth. `git push` после каждой завершённой задачи разрешён и обязателен (standing-одобрение Вадима 2026-07-19, континуитет — `docs/MASTER_PLAN_2026-07-19.md` §8.6); force-push запрещён; deploy идёт автоматически с main. Не запускай локальный OmniCoder. Соблюдай TDD и возвращай: files changed, tests/exit codes, artifacts/hashes, blockers и claims requiring independent verification. При возобновлении работы первым читай `docs/EXECUTION_STATE.md`.

Главный продуктовый тест: работа должна приближать реальный путь `topic → research → cards → script/storyboard → voice file → MP4 → platform variants → approval`.
