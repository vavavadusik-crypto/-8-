# Changelog

## Unreleased — R1 local media tracer

- Locked Hermest Board's product North Star around the full topic-to-video-to-publishing conveyor.
- Moved inline application JavaScript into CSP-compatible modules and hardened imported card-image rendering.
- Added a pure board-to-storyboard/script domain core with schema/resource limits, stable order and source lineage.
- Added a provider-neutral narration port with a real no-key FFmpeg/Flite WAV smoke adapter.
- Added deterministic 16:9 and 9:16 FFmpeg rendering to H.264/AAC MP4, SRT and storyboard artifacts.
- Added private per-run directories, atomic files, process cancellation/timeouts, scrubbed media subprocess environments and strict ffprobe QC.
- Added deterministic manifests with recipe/tool/QC/lineage evidence, artifact hashes and a SHA-256 sidecar.
- Added iterative structural preflight, fail-closed command evidence/redaction, physical `/tmp` output containment and direct independent ffprobe integration checks after an external BLOCK review.
- Added 88 unit tests and four real repeat media renders across both aspect ratios to the canonical `npm run check` gate.
- Kept vertical variants explicitly `aspect_only_r1`; semantic shorts, quality multilingual TTS and UI/worker integration remain tracked blockers.

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
