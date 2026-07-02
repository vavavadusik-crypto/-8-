# Deployment

Hermest Board is currently a static frontend app with a small optional Vercel API skeleton. The frontend can be deployed anywhere that serves a Vite build. The `api/` endpoints require Vercel or another backend-capable host.

## Local

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run check
```

The production artifact is written to `dist/`.

## Secret File Audit

If credentials are collected in a local markdown/env file, audit them without printing the values:

```bash
npm run audit:secrets -- "/home/architect/Рабочий стол/Hermest-Board-ключи-и-план-полного-деплоя.md"
```

Never commit that credentials file.

## Vercel

Preview:

```bash
npm install
npm run build
npx vercel deploy
```

Production:

```bash
npx vercel deploy --prod
```

CI/CD:

- Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as GitHub repository secrets.
- Use `.github/workflows/deploy-vercel.yml` after moving this folder to its own repository.
- Keep platform API secrets in Vercel or a backend service. Do not expose them as frontend variables.

## Netlify

Netlify can use `netlify.toml`:

```bash
npm install
npm run build
```

Publish directory: `dist`.

## Docker

```bash
docker build -t hermest-board .
docker run --rm -p 8080:80 hermest-board
```

Open `http://127.0.0.1:8080`.

## Static Hosts

Any static host works if it serves:

- `dist/index.html`
- `dist/assets/*`
- `dist/hermest-board.svg`
- `dist/site.webmanifest`
- `dist/sw.js`

For SPA routing, route unknown paths back to `index.html`.

Static-only hosts will not run the `api/` endpoints. Use Vercel or another backend-capable host when connector status, publish-pack validation, OAuth, or real publishing are needed.

## API Health Checks

When deployed on Vercel:

```bash
curl https://your-domain.example/api/health
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
