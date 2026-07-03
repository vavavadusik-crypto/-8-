# Worklog

## 2026-07-03

- Hardened temporary public demo storage:
  - owner-token protection now covers project, asset, job, and audit read routes when `HERMEST_ENABLE_DEMO_STORAGE=1` on Vercel;
  - external durable-storage env presence is smoke-tested to stay guarded until a real adapter/auth/authorization layer exists;
  - API smoke coverage now checks demo-storage read guards and owner-token authenticated reads.
- Hardened agent job status handling:
  - aligned API-created approval jobs with the durable schema status `waiting_for_approval`;
  - rejected invalid job status updates;
  - extended API smoke coverage for blocked jobs, approval-gated jobs, and invalid status PATCH requests.
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
- Added bootstrap owner-token write guard and API smoke checks for product routes.
- Added first Postgres schema draft for durable storage/auth phase.
- Added runnable draft SQL at `db/postgres-schema.sql`.
- Added Fable 5 Ultracode maximum upgrade mandate with official standards references.
- Confirmed Fable auto-resume created infrastructure but no product commits; paused the timer to avoid more limit burn and agent conflicts.
- Added a security review baseline, CSP/COOP headers, and a live production verification script.
