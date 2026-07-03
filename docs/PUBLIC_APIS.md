# Public And Free API Layer

Hermest Board now has a safe public research layer under `api/`.

These endpoints do not expose owner secrets to users.

## Endpoints

```text
GET /api/public/sources
GET /api/research/search?q=ai+agents
GET /api/user-config/schema
GET /api/connectors/start?provider=youtube
GET /api/connectors/start?provider=tiktok
GET /api/connectors/start?provider=instagram
GET /api/connectors/callback
POST /api/product?route=agent/plan
```

## No-Key Sources

These can work without private API keys:

- Wikipedia / MediaWiki REST API;
- Crossref REST API;
- arXiv API;
- GitHub public repository search, rate-limited without a token.

## Optional Free-Key Sources

These can be added later through server-side env vars:

- `OPENALEX_API_KEY` for OpenAlex;
- `GITHUB_TOKEN` for higher GitHub API limits;
- `SUPPORT_EMAIL` for polite API identification.

## Security Rules

- Never put `OPENAI_API_KEY`, platform secrets, database URLs, or storage tokens into frontend code.
- Users should connect YouTube, TikTok, and Instagram through OAuth.
- Owner platform secrets stay server-side.
- User tokens must later be encrypted and stored per user.
- The current OAuth endpoints only create start URLs or report missing config; token exchange is not implemented yet.

## What This Enables Now

- The app can list public/free sources;
- backend can search public sources after Vercel deploy;
- UI can show users what account connectors are needed;
- publish packs can include source research tasks.
- backend can produce a deterministic agent execution plan and list blockers.

## What Still Needs Backend Work

- database-backed users;
- OAuth sessions and callback token exchange;
- encrypted token storage;
- parser worker;
- translation worker;
- media generation worker;
- publishing worker;
- publish approval screen.
