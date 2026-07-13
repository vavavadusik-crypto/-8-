# Hermest Board — Media Rendering Architecture

Дата: 2026-07-13
Статус: TARGET + FIRST IMPLEMENTATION DECISION

## 1. Architectural decision

Build the first real media vertical as a local/worker-capable Node CLI around installed FFmpeg/ffprobe. The browser remains the creative control plane; it exports/submits a versioned project. Media bytes never run through Vercel Functions.

```text
Board JSON
  → pure content-domain module
  → storyboard/timeline JSON
  → TTS adapter → narration audio
  → subtitle builder → SRT/VTT
  → FFmpeg render adapter
  → MP4 variants + manifest
```

The CLI proves contracts locally and later becomes the implementation core of `board-worker`. No queue/provider vendor is required for the first tracer.

## 2. First repository shape

```text
src/domain/content-pipeline.js
src/domain/platform-recipes.js
src/media/manifest.js
src/media/subtitles.js
src/media/ffmpeg.js
src/media/tts.js
scripts/render-project.mjs
test/unit/content-pipeline.test.mjs
test/unit/platform-recipes.test.mjs
test/unit/subtitles.test.mjs
test/integration/render-project.test.mjs
test/fixtures/minimal-board.json
```

Exact names may change only through a documented ADR; avoid embedding media logic back into `src/app.js`.

## 3. TTS adapter order

Contract: `synthesize({text, language, voice, outputPath, signal}) → metadata`.

Initial deterministic smoke can use FFmpeg's compiled `flite` source to prove a real audio stream without keys. It is a test/offline fallback, not the promised high-quality Russian voice.

Release-quality adapters are selected by measured eval and may include:

- user-owned/server-managed commercial TTS API;
- local Piper-class model with verified voice license;
- browser preview only as non-export fallback.

No undocumented scraping endpoint is a production dependency. Credentials are references, never argv/log/manifest values.

## 4. Renderer

First renderer uses safe argv without shell interpolation. It supports:

- generated title-card fallback for every scene;
- optional validated local raster image;
- scene duration from measured narration;
- simple Ken Burns/zoom/pan and crossfade only after deterministic baseline;
- narration mix and normalized output;
- burned subtitles plus sidecar SRT;
- H.264/AAC MP4;
- 16:9 and 9:16 recipes.

Inputs use per-run temp directories. Filenames are generated IDs, not user strings. Cleanup occurs after artifacts/manifests are finalized.

## 5. Provider-neutral media generation

Image/video generation is an adapter returning an Asset contract. The timeline never depends directly on a provider SDK. A scene without generated media still renders via deterministic title-card fallback; provider outage cannot erase the ability to produce a complete video.

## 6. Worker boundary

Vercel API creates job/outbox metadata and signed object refs. A separate worker claims with lease, downloads authorized inputs, runs TTS/render, uploads artifacts and records results. PostgreSQL is job source of truth; queue delivery is at-least-once.

First local CLI does not claim production queue readiness.

## 7. Safety

- validate paths under explicit project/run roots;
- no shell command strings;
- ffprobe before processing untrusted media;
- duration/resolution/bytes/process/time/temp limits;
- block network URL fetch inside renderer; acquisition is a separate SSRF-hardened adapter;
- non-root/read-only container target;
- render worker never receives social connector tokens;
- generated/uploaded assets retain rights/provenance metadata.

## 8. Verification

A render integration test must create outputs under an OS tempfile path and assert:

- process exit 0;
- manifest schema/fields;
- MP4 and SRT exist and are non-empty;
- ffprobe sees H.264-compatible video and audio stream;
- 16:9 and 9:16 dimensions match recipes;
- duration is positive and within expected tolerance;
- input text and secrets are not leaked into command logs.

Generated fixtures/output remain ignored and are never committed.
