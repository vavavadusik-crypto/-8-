# Worklog

## 2026-07-03

- Verified local project is its own clean git repo on `main`.
- Verified GitHub `origin/main` matches local commit `bef87cb`.
- Verified public production endpoints are live:
  - `GET /api/health`
  - `GET /api/connectors/status`
  - `GET /api/public/sources`
  - source zip download under `/download/hermest-board-alpha-source.zip`
- Added backend API contracts behind one Vercel Hobby-safe endpoint:
  - storage status;
  - projects;
  - assets;
  - jobs;
  - audit;
  - agent plan preview.
- Added safe JSON-file storage adapter for local development.
- Blocked unsafe public Vercel writes unless demo storage is explicitly enabled.
- Connected UI buttons for storage status, API save/load, and backend agent plan.
- Updated product readiness, architecture, deployment, and API docs.
- Added Fable handoff and roadmap documentation for continuing the project toward 1.0.0.
