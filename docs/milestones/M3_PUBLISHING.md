# Milestone M3 — Publishing contract + safe adapter (PHASE 3)

Даём честный путь к публикации: один реально рабочий адаптер + production-ready config-path для соцсетей с **честным статусом** (никакого fake-success).

## Что закрыто

- **Общий publishing-контракт** — `src/publishing/publish-contract.js`: `validatePublishOptions` (mode draft|live, idempotencyKey 8–128, signal), `buildReceipt` (immutable, sanitized), `sanitizeError` (redaction api_key/token/Bearer). **Draft — безопасный дефолт.**
- **Fail-closed confirm-гейт** (master-prompt PHASE 3 req 5): `mode:"live"` без `confirm===true` → throw `live_publish_requires_explicit_confirm`. Enforced на реальном пути (webhook-адаптер зовёт `validatePublishOptions`). Проверено живьём.
- **Один рабочий безопасно-тестируемый адаптер** — `src/publishing/adapters/webhook-export.js`: POST publish-pack/manifest на конфигурируемый URL; receipt `{platform, remoteId?, status, timestamp, url?, sanitizedError?}`; idempotency-key; retry только на safe (5xx/сеть) с backoff; 429 rate-limit; cancellation (AbortSignal). Тест — против локального mock-endpoint (integration-smoke, без сети).
- **Честный статус соцсетей** — `src/publishing/platform-status.js`: webhook `available:true/requiresAuth:false`; YouTube/YouTube-Shorts/TikTok/Instagram-Reels `available:false, mode:"unavailable", requiresAuth:true`, statusReason `needs_oauth_app — Client ID/Secret not configured…`. Никакой фейковой доступности.
- **api/product.js**: GET `publishing/platforms` отдаёт per-platform статус фронту.

## Полосы

- Backend (терминальный claude, merge `ea4608d`): контракт + webhook-адаптер + platform-status + api-wiring + 3 тест-файла.
- Review-фикс (Claude Fable 5): confirm-гейт `e9d6834` — терм. claude заявил «Gate M3 closed», но req 5 (явное подтверждение live) не выполнялся; закрыт через RED→GREEN (+негативный тест live-без-confirm).

## Gate M3

`npm run test:unit`: 451 / 0. Integration webhook-smoke: 1/1 (реальный receipt против mock). Полный `npm run check` — см. коммит закрытия. Push НЕ делался.

## Честные гэпы / next

- Платформ-специфичные адаптеры YouTube/TikTok/Instagram — только config-path + статус; реальная публикация требует OAuth-приложений (регистрация Вадимом) + platform review. Честно помечено `needs_oauth_app`.
- publish-webhook-smoke вписан в гейт (см. коммит) — иначе не гонялся в `npm run check`.
