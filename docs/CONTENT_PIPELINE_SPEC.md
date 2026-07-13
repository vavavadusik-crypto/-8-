# Hermest Board — Content Pipeline Specification

Дата: 2026-07-13
Статус: TARGET CONTRACT / CURRENT AUTHORITY

## 1. Pipeline

```text
intake → research → evidence → outline → script → storyboard
→ assets → narration → timeline → render → qc → approval
→ package/publish → observe → iterate
```

Каждая стадия получает versioned input, создаёт immutable output artifact и blocker list. Стадия не может повышать status только по exit code.

## 2. States

```text
draft
researching → research_ready | blocked
scripting → script_ready | blocked
storyboarding → storyboard_ready | blocked
preparing_assets → assets_ready | blocked
rendering → render_ready | failed | cancelled
quality_check → waiting_for_approval | blocked
approved → publishing | packaged
publishing → published | delivered_to_inbox | unknown | failed
```

`unknown` после внешнего side effect требует reconciliation, не blind retry.

## 3. Core project contract

```json
{
  "schemaVersion": 1,
  "projectId": "opaque-id",
  "title": "string",
  "brief": {
    "topic": "string",
    "audience": "string",
    "language": "ru",
    "tone": "documentary",
    "masterDurationSeconds": 1200,
    "platforms": ["youtube_video", "youtube_shorts", "tiktok", "instagram_reels"]
  },
  "cards": [],
  "links": [],
  "sources": [],
  "script": {},
  "storyboard": {},
  "renderRecipes": [],
  "publishCandidates": []
}
```

Existing board JSON remains importable. Migration adds fields; it must not destroy unknown safe fields.

## 4. Evidence cards

A `source` card stores provider, canonical URL, title, retrieved timestamp, publisher/author where known, license/rights metadata and extraction hash. A `fact` card stores statement, source refs, confidence, contradiction refs and human notes. Generated explanation must not masquerade as a sourced fact.

## 5. Storyboard contract

Each scene has:

```json
{
  "id": "scene-001",
  "order": 1,
  "title": "Opening hook",
  "narration": "...",
  "durationMs": 6000,
  "visual": {
    "assetRef": "asset-or-null",
    "fallbackStyle": "title-card",
    "motion": "slow-zoom"
  },
  "sourceRefs": ["source-001"],
  "subtitleMode": "burn_and_sidecar",
  "blockers": []
}
```

Durations are estimates before narration and measured after TTS. Timeline reconciliation may adjust scene holds without changing narration text.

## 6. Asset contract

Every asset records:

- immutable ID/content hash;
- type/MIME/bytes/dimensions/duration;
- origin: uploaded/found/generated/rendered;
- source URL/provider/model/prompt where applicable;
- rights status: `unknown|allowed|restricted|owned|generated`;
- local/object-storage reference;
- safety/probe status;
- parent artifacts.

Unknown or restricted assets block public candidate creation unless replaced or explicitly licensed.

## 7. Audio/subtitle contract

Narration artifact records provider, model/voice, language, measured duration, sample rate/channels, script hash and pronunciation warnings. Subtitle cues derive from narration timing where available; a deterministic fallback distributes timings by sentence/word weight and marks timing quality.

## 8. Render recipe

Recipe specifies canvas, fps, codec/container, audio loudness target, subtitle layout, transition policy, safe zones, max duration and segmentation strategy. First built-in recipes:

- `youtube-16x9-1080p`;
- `shorts-9x16-1080p`;
- `tiktok-9x16-1080p`;
- `reels-9x16-1080p`.

Shorts are semantic editions with their own hook/CTA; naive fixed-window chopping is not accepted as final adaptation.

## 9. Manifest

Every run writes a manifest with:

- input/project/storyboard hashes;
- tool/runtime versions;
- provider/recipe versions;
- command argv (redacted, no secrets);
- artifacts, hashes, bytes, dimensions, streams, duration;
- tests/QC results;
- blockers/warnings;
- parent/child lineage.

## 10. Quality gates

Before local approval:

- JSON/schema valid;
- all scenes have narration and visual fallback;
- `ffprobe` confirms expected streams/dimensions/duration;
- no zero-byte or missing artifact;
- subtitles parse and fit timeline;
- asset provenance/rights visible;
- output hash recorded;
- no secret or local credential path in manifest.

Before publication additionally require connector readiness, exact approval, current platform policy and immutable candidate match.
