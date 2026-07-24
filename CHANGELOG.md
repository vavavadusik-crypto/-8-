# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added (M6 — Open-Source Preparation, 2026-07-24, IN PROGRESS)
- **Community files** for public open-source release:
  - `CONTRIBUTING.md` (quickstart, PR workflow, first-time contributor guide, TDD rules, architecture invariants)
  - `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
  - `SECURITY.md` (vulnerability reporting, supported versions, security best practices, security features, roadmap)
  - `SUPPORT.md` (documentation links, troubleshooting, how to ask good questions, community channels)
  - `GOVERNANCE.md` (project ownership, maintainer responsibilities, decision-making process, roadmap priorities)
  - `ROADMAP.md` (derived from MASTER_PLAN phases P0-P7, honest statuses)
  - `THIRD_PARTY_NOTICES.md` (full dependency tree + honest licenses)
  - `docs/licenses.json` (machine-readable license report)
  - `LICENSE_DECISION.md` (AGPL-3.0-or-later vs Apache-2.0 recommendation, awaiting owner decision)
- **README.md** honest feature matrix (VERIFIED/PARTIAL/PLANNED statuses), CI Gate badge, quickstart for GitHub Codespaces + local, architecture summary.

### Changed
- **SECURITY.md** expanded with detailed vulnerability reporting process, supported versions table, security best practices for users, security features overview, security roadmap.
- **CHANGELOG.md** reformatted to [Keep a Changelog](https://keepachangelog.com/) standard with [Unreleased], [M6], [M5], [M4], [M3], [M2], [M1] sections.

---

## [M5] — Codespaces & CI — 2026-07-24

### Added
- **GitHub Codespaces** devcontainer (`.devcontainer/devcontainer.json`) — zero laptop load, cloud dev environment with ffmpeg pre-installed.
- **CI Gate** GitHub Actions workflow (`.github/workflows/ci.yml`) — full quality gate (451 unit + 6 media real FFmpeg + build + smoke, all exit 0) on every push/PR. Public repo = unlimited minutes, offloads heavy builds from local laptop.

---

## [M4] — Workspace Storage — 2026-07-24

### Added
- **SQLite node:sqlite workspace persistence** (clients/projects/campaigns/content/assets/render+publish jobs/notes) — durable across restarts.
- **Workspace API routes** `/api/product?route=workspace/*` — create/read/update/delete/list for all workspace entities.
- **Tenant/workspace permission** (single-user default, multi-user owner check).
- **Backup + delete workspace** (scoped export, cascade delete).
- **Tag filter** for list endpoints (search/status/tag).
- **Integration test** `test:workspace` in quality gate — workspace CRUD + tenant isolation + backup/delete verified with real SQLite.

### Fixed
- **On-disk database persistence** (was in-memory by default, now persists to `data/workspace.db` on disk).

---

## [M3] — Publishing Contract — 2026-07-23

### Added
- **Publish contract** (`src/local-media/publish-contract.js`) — draft-default, buildReceipt, sanitizeError redaction.
- **Webhook adapter** (idempotency/retry-safe/429/cancel) — skeleton for future social platform integrations.
- **Platform status** (`/api/product?route=platform-status`) — webhook available; YouTube/TikTok/Instagram needs_oauth_app (honest).
- **Publish smoke test** (`test/integration/publish-webhook-smoke.test.mjs`) — added to quality gate forever.
- **Fail-closed confirm gate** (req5) — enforced on adapter, negative test ensures unapproved publishes are blocked.

### Changed
- **API wiring** for publish routes.

**Honest gap:** Real social adapters require OAuth apps (registration by owner) + platform review — publish skeleton ready, token exchange not implemented.

---

## [M2] — B-Roll Pipeline — 2026-07-23

### Added
- **B-roll providers unified contract** (`src/media/broll-providers.js`) — kind/costClass/health/timeout/retry/cancel/provenance + registry.
- **Fail-open cascade** in render-project: generative-image → stock → deterministic, every scene gets provenance+assetType.
- **Video validation** (`src/media/video-validation.js`) — MP4 magic-byte check.
- **Manifest `footage[].assetType`** — tracks asset source for each scene.
- **VALID_BROLL_MODES** — auto/free/premium/deterministic.
- **Environment variable** `HERMEST_BROLL_MODE` — forces offline mode (product default: auto/Pollinations).
- **New media test** "deterministic mode MP4 without external API calls" — proves free path works offline.

### Changed
- **6 media tests** (real FFmpeg) now include offline smoke.

**Honest gap:** Analytics block lacks per-scene assetType breakdown (backend follow-up).

---

## [M1] — Analytics — 2026-07-23

### Added
- **Render analytics block** (`src/app/components/render-analytics.js`) — shown on completed renders, displays:
  - Duration (mm:ss)
  - LUFS (loudness)
  - MP4 size
  - Scene count
  - Voice + language
  - Format (aspect ratio + recipe)
  - Music used
  - Artifact count
  - SHA-256 of MP4
- **"Copy summary" button** — copies analytics as plaintext.
- **Responsive design** — mobile 375px, a11y section (role=region, aria-labelledby).
- **Backend `job.analytics`** — additive field, only on completed renders, derived from verified `result.manifest`. Sanity-checked (paths → `<path>`, field length ≤80/120, sha256 `/^[a-f0-9]{64}$/`). Null/0 without guessing.
- **6 unit tests** (`test/unit/job-manager-analytics.test.mjs`) — analytics derivation, sanitization, cancellation-late-result guard.

### Changed
- **Quality gate** includes analytics smoke (live render → analytics block rendered).

---

## [0.3.0] — 2026-07-22 (Release v0.3.0)

- Added a "topic → video" wizard with async submit/poll orchestration.
- Added a browser-bridge director across four providers plus any OpenAI-compatible API (presets or custom URL, including free local Ollama).
- Added free opt-in Pollinations background generation with a FAL/Pexels fallback cascade.
- Added multilingual narration via Piper and ElevenLabs.
- Added premium animation, Ken Burns motion, b-roll and background music.
- Switched the service worker to a network-first strategy.
- Hardened the Docker image with reproducible `npm ci` and a `.dockerignore`.
- Added a SHA-256 release manifest and `RELEASE_STATUS` reporting.
- Refreshed the README for shipped features and pinned `engines.node`.

## Unreleased — R1 local media tracer

- Locked Hermest Board's product North Star around the full topic-to-video-to-publishing conveyor.
- Moved inline application JavaScript into CSP-compatible modules and hardened imported card-image rendering.
- Added a pure board-to-storyboard/script domain core with schema/resource limits, stable order and source lineage.
- Added a provider-neutral narration port with a real no-key FFmpeg/Flite WAV smoke adapter.
- Added deterministic 16:9 and 9:16 FFmpeg rendering to H.264/AAC MP4, SRT and storyboard artifacts.
- Added private per-run directories, atomic files, process cancellation/timeouts, scrubbed media subprocess environments and strict ffprobe QC.
- Added deterministic manifests with recipe/tool/QC/lineage evidence, artifact hashes and a SHA-256 sidecar.
- Added iterative structural preflight, fail-closed per-command FFmpeg argv schemas/redaction, physical `/tmp` output containment and direct independent ffprobe integration checks after external BLOCK reviews.
- Added 107 unit tests and four real repeat media renders across both aspect ratios to the canonical `npm run check` gate.
- Added deterministic sealed publish candidates with project/render/rights digests, workspace authorization and exact stale-safe approval binding.
- Added a runtime-aware connector capability router over the shared 44-provider catalog; secret-free status and agent plans distinguish configured slots from implemented/executable adapters.
- Added a loopback-only Board render worker with bounded queueing, cancellation, allowlisted artifact downloads and lifecycle cleanup.
- Connected truthful local render controls to the Board UI and verified a real HTTP → FFmpeg/TTS → downloaded MP4 path independently with ffprobe.
- Kept vertical variants explicitly `aspect_only_r1`; semantic shorts, quality multilingual TTS, durable cloud workers and public connectors remain tracked blockers.

## 0.2.0

- Interactive Hermest Board with draggable/resizable cards.
- Script, roadmap, voiceover, auto-tour, WebM recording, and publish-pack flow.
- Backend API skeleton for health, readiness, storage contracts, connector
  status, AI response proxy, OAuth state, token vault, and agent plan preview.
- Unit tests, validation, API smoke checks, production build, and render smoke
  verification.

## Repository maintenance

- Added security policy, licensing status, issue template, pull request
  template, and changelog.
- Kept `public/download/hermest-board-alpha-source.zip` in place until the
  maintainer decides whether to move downloadable archives to GitHub Releases.
