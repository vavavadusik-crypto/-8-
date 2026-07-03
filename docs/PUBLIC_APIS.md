# Public And Free API Layer

Hermest Board now has a safe public research layer under `api/`.

These endpoints do not expose owner secrets to users.

## Endpoints

```text
GET /api/public/sources
GET /api/research/search?q=ai+agents
GET /api/user-config/schema
GET /api-provider-catalog.json
GET /api/connectors/start?provider=youtube
GET /api/connectors/start?provider=tiktok
GET /api/connectors/start?provider=instagram
GET /api/connectors/callback
POST /api/product?route=agent/plan
```

## No-Key Sources

These can work without private API keys:

- Wikipedia / MediaWiki REST API;
- Wikidata entity search;
- Wikimedia Commons media search with license metadata;
- Crossref REST API;
- arXiv API;
- Open Library;
- GitHub public repository search, rate-limited without a token.

Each public source is called with a per-source timeout so one slow provider does
not block the whole research response.

## Optional Free-Key Sources

These can be added later through server-side env vars:

- `OPENALEX_API_KEY` for OpenAlex;
- `GITHUB_TOKEN` for higher GitHub API limits;
- `SUPPORT_EMAIL` for polite API identification.

## Provider Catalog

`public/api-provider-catalog.json` lists 40+ provider slots across AI, model
routers, public search, stock media, voice, social publishing, workflow
automation, email, payments, and storage. The catalog stores official docs and
signup URLs, not secret values. Users must bring their own keys or activate
no-key sources.

## Security Rules

- Never put `OPENAI_API_KEY`, platform secrets, database URLs, or storage tokens into frontend code.
- Do not ship scraped or leaked "free API keys" from the internet.
- Users should connect YouTube, TikTok, and Instagram through OAuth.
- Owner platform secrets stay server-side.
- User tokens must later be encrypted and stored per user.
- The current OAuth endpoints create signed-state start URLs and validate
  callback state; token exchange is not implemented yet.

## What This Enables Now

- The app can list public/free sources;
- backend can search public sources after Vercel deploy;
- UI can show users what account connectors are needed;
- publish packs can include source research tasks.
- backend can produce a deterministic agent execution plan and list blockers.

## What Still Needs Backend Work

- database-backed users;
- OAuth token exchange after signed-state callback validation;
- encrypted token storage;
- parser worker;
- translation worker;
- media generation worker;
- publishing worker;
- publish approval screen.
