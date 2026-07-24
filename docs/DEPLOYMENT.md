# Deployment

Hermest Board supports multiple deployment modes. **Choose the mode that fits your needs:**

## Deploy Mode Matrix

| Mode | Real MP4 render? | Data storage | Best for |
|------|------------------|--------------|----------|
| **Self-host (full)** — Docker (`Dockerfile.selfhost`) / compose / bare-metal (`scripts/install.sh`) | ✅ YES (ffmpeg + chromium + piper) | Private/local (named volumes / `.data/`) | Full features, privacy, BYOK keys |
| **Frontend-only (static)** — Docker (`Dockerfile`) / Netlify / any static host | ❌ NO (media worker absent) | Board + export only (no server state) | Static SPA preview, no rendering |
| **Vercel** — API skeleton + frontend | ❌ NO (no worker) | Ephemeral (`.data/` is ephemeral; postgres available but not connected to worker) | API skeleton + board UI |

---

## Self-Host (Full — Real MP4 Rendering)

Run the **complete** Hermest Board stack locally or on your server — frontend + media worker with **real MP4 rendering** (ffmpeg, chromium, piper TTS). All features. Private data. BYOK keys.

### Prerequisites

- **Docker + Compose** (for containerized deploy) OR
- **Node.js ≥20.11** + **Debian/Ubuntu** (for bare-metal install)

### Quick Start (Docker Compose — ONE COMMAND)

```bash
# 1. Clone repo
git clone https://github.com/your-org/hermest-board.git
cd hermest-board

# 2. (Optional) Create .env with BYOK keys (see below)
cp .env.example .env
# Edit .env and fill HERMEST_ELEVENLABS_API_KEY, HERMEST_FAL_API_KEY, HERMEST_PEXELS_API_KEY

# 3. Run
docker compose up
```

Open `http://localhost:8080`. **That's it.** The worker renders real MP4s with ffmpeg + chromium + piper inside the container.

### BYOK Keys (Optional)

The media worker reads these environment variables for third-party providers (all **optional** — offline rendering works without them):

- `HERMEST_ELEVENLABS_API_KEY` — ElevenLabs TTS API key (for ElevenLabs voices)
- `HERMEST_FAL_API_KEY` — Fal.ai API key (for AI image/video generation)
- `HERMEST_PEXELS_API_KEY` — Pexels API key (for stock video footage)

**How to pass keys:**

1. Create `.env` file (already in `.gitignore`):
   ```bash
   HERMEST_ELEVENLABS_API_KEY=sk-...
   HERMEST_FAL_API_KEY=...
   HERMEST_PEXELS_API_KEY=...
   ```
2. `docker compose` reads `.env` automatically and passes keys to the container.

**NO keys?** Offline rendering still works (deterministic, local piper TTS + fallback media).

### Bare-Metal Install (Debian/Ubuntu)

Run `scripts/install.sh` — one-command installer for Debian/Ubuntu:

```bash
bash scripts/install.sh
```

**What it does:**

- Checks Node.js ≥20.11 (fails with instructions if missing).
- Installs `ffmpeg` + `chromium` via `apt` (requires `sudo`).
- Installs piper TTS + voices (local `~/.local/opt/piper`).
- Runs `npm ci` + `npm run build`.

**After install:**

```bash
PORT=8080 npm run preview -- --host 0.0.0.0
```

Open `http://localhost:8080`.

**BYOK keys:** Pass via environment:

```bash
HERMEST_ELEVENLABS_API_KEY=sk-... \
HERMEST_FAL_API_KEY=... \
HERMEST_PEXELS_API_KEY=... \
PORT=8080 npm run preview -- --host 0.0.0.0
```

Or create `.env` (gitignored) with the keys above.

### Data Persistence (Docker)

The compose file mounts a named volume `workspace-data:/app/.data` — your workspace projects persist across container restarts. Render output (`/tmp`) is ephemeral by default (add a named volume if you need persistence).

---

## Frontend-Only (Static — NO MP4 Render)

Deploy the Hermest Board **SPA only** (board UI + export) — **without the media worker**. No ffmpeg/chromium/piper → **NO real MP4 rendering**. Use this for static hosting or quick previews.

### Docker (Static nginx)

```bash
docker build -t hermest-board .
docker run --rm -p 8080:80 hermest-board
```

Open `http://127.0.0.1:8080`.

**Note:** The existing `Dockerfile` serves ONLY the built SPA via nginx. The media worker is absent, so render requests will fail.

### Netlify

Netlify uses `netlify.toml`:

```bash
npm install
npm run build
```

Publish directory: `dist`.

### Other Static Hosts

Any static host works if it serves:

- `dist/index.html`
- `dist/assets/*`
- `dist/hermest-board.svg`
- `dist/site.webmanifest`
- `dist/sw.js`

For SPA routing, route unknown paths back to `index.html`.

**Static-only hosts will NOT run the `api/` endpoints or the media worker.** Use Vercel or self-host when API/OAuth/rendering are needed.

---

## Vercel

Vercel deploys the API skeleton (`api/`) + frontend. The media worker is absent, so **NO real MP4 rendering**.

### Preview

```bash
npm install
npm run build
npx vercel deploy
```

### Production

```bash
npx vercel deploy --prod
```

### CI/CD

- Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as GitHub repository secrets.
- Use `.github/workflows/deploy-vercel.yml` after moving this folder to its own repository.
- Keep platform API secrets in Vercel or a backend service. Do not expose them as frontend variables.
- Configure `HERMEST_OAUTH_STATE_SECRET` before enabling connector start URLs.
  Without it, configured OAuth providers stay blocked rather than issuing
  unsigned callback state.
- Configure `HERMEST_TOKEN_ENCRYPTION_KEY` before storing OAuth connector tokens.
  Connector token writes are rejected without it, and token values are never
  returned by API responses.

---

## Local Development

```bash
npm install
npm run dev
```

The media worker runs automatically in dev mode (`vite-plugin.js` via `configureServer`). Real rendering works locally if `ffmpeg`, `chromium`, and piper are installed (see `scripts/install-piper-ci.sh`).

---

## Production Build (No Deploy)

```bash
npm run check
```

The production artifact is written to `dist/`.

---

## Secret File Audit

If credentials are collected in a local markdown/env file, audit them without printing the values:

```bash
npm run audit:secrets -- "/path/to/keys.md"
```

Never commit that credentials file.

---

## API Health Checks

When deployed on Vercel:

```bash
npm run verify:live
```

Manual checks:

```bash
curl https://your-domain.example/api/health
curl 'https://your-domain.example/api/product?route=storage/status'
curl https://your-domain.example/api/connectors/status
curl 'https://your-domain.example/api/public/sources'
curl 'https://your-domain.example/api/research/search?q=ai%20agents'
```

Publish pack validation:

```bash
curl -X POST https://your-domain.example/api/publish-pack/validate \
  -H 'content-type: application/json' \
  --data @hermest-publish-pack.json
```

Agent plan preview:

```bash
curl -X POST 'https://your-domain.example/api/product?route=agent/plan' \
  -H 'content-type: application/json' \
  --data @hermest-publish-pack.json
```

---

## Server Storage

Local development uses a JSON-file adapter under `.data/hermest-board`.

On public Vercel, project writes are disabled by default because serverless
filesystem storage is ephemeral. Do not enable public project writes until the
app has durable storage, user accounts, authorization, and encrypted connector
token storage.

`HERMEST_ENABLE_DEMO_STORAGE=1` can be used only for temporary demos where data
loss is acceptable. It must not be used for private customer data. When this
mode is enabled on public Vercel, configure `HERMEST_OWNER_TOKEN`; project,
asset, job, and audit read/write routes are blocked without it.

The guarded bootstrap Postgres adapter is available for the next deployment
phase:

```bash
HERMEST_STORAGE_ADAPTER=postgres
DATABASE_URL=postgres://...
HERMEST_ENABLE_DURABLE_STORAGE=1
HERMEST_SESSION_SECRET=<long random secret>
HERMEST_ACCOUNT_AUTH=1
```

Without `HERMEST_ENABLE_DURABLE_STORAGE=1`, Vercel keeps using the safe read-only
guard. Without `HERMEST_OWNER_TOKEN` or `HERMEST_SESSION_SECRET`, durable writes
stay blocked even if the Postgres adapter is enabled.

When both `HERMEST_OWNER_TOKEN` and `HERMEST_SESSION_SECRET` are configured,
`POST /api/product?route=session/bootstrap` can issue a short-lived signed
session token for controlled demos or migration testing. Keep this behind the
owner token; it is not a public login system.

The public account-auth routes stay blocked unless `HERMEST_ACCOUNT_AUTH=1`,
`HERMEST_SESSION_SECRET`, and writable storage are all active. When enabled,
signup/login set `hermest_session` as an httpOnly `SameSite=Lax` cookie and
store only a scrypt password hash, never the plaintext password. Do not enable
this for real customers until durable storage, rate limiting, CSRF review,
password recovery, workspace membership, and live unauthorized-path tests are in
place.
