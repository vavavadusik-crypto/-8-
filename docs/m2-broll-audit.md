# M2 B-roll Runtime — Audit of Existing Implementation

**Objective**: Extend the render pipeline to support multiple B-roll sources (generative clips, stock footage, generated images + motion, deterministic fallback) with fail-open cascade, provenance tracking, and robust cost-free defaults for the FREE tier.

---

## Current State

### 1. `src/media/broll-source.js`

**Provider**: Pexels stock video clips only.

**Contract**:
- `describeBrollAvailability({ env })` → `{ status: "missing" | "executable", provider: "pexels", reason? }`
- `createPexelsBrollAdapter({ env, fetchImpl })` → adapter with `fetchClip({ keywords, orientation, minDurationSeconds, outputPath, signal })`
- Returns `{ path, sha256, bytes, durationSeconds, license: "pexels", provenance: { source: "stock", provider: "pexels", clipId, author, url } }`
- **Key read**: `HERMEST_PEXELS_API_KEY`
- **Validation**: safe output path, orientation `portrait|landscape`, minDuration within 0..3600 sec
- **Quotas**: MAX_CLIP_BYTES = 80 MB, MAX_RESPONSE_BYTES = 512 KB, REQUEST_TIMEOUT_MS = 30s, DOWNLOAD_TIMEOUT_MS = 120s
- **Error handling**: 401/403 → `"Pexels rejected the API key"`, no-match → returns `null`, empty clip → throws
- **Retry**: none built-in (single-shot call)
- **AbortSignal**: wired through `fetchWithTimeout`
- **Magic-byte check**: none (relies on Pexels returning valid MP4)

**Current wiring in `render-project.js:189–224`**:
```javascript
const brollAvailability = describeBrollAvailability();
const brollClips = [];
if (brollAvailability.status === "executable") {
  const brollAdapter = createPexelsBrollAdapter();
  for scene 1..N (scene 0 = intro, skipped):
    try {
      clip = await brollAdapter.fetchClip({ keywords: [topic, scene.title], ... });
      if (clip) {
        brollClips[sceneIndex] = clip;
        footage.push({ sceneIndex, license, sha256, provenance });
      } else {
        footageWarnings.push("no b-roll footage matched scene X");
      }
    } catch (error) {
      footageWarnings.push(`b-roll fetch failed for scene X: ${error.message}`);
    }
} else {
  footageWarnings.push(brollAvailability.reason);
}
```

**Key properties**:
- Already **fail-open**: missing key or fetch failure → warning, render continues with generated background or deterministic fallback
- **Per-scene** provenance already tracked in `footage[]` array
- Scene 0 (intro) deliberately **skips** b-roll

---

### 2. `src/media/image-source.js`

**Providers**: FAL (paid, generative), Pollinations (free, generative), Pexels photos (stock).

**Contract**:
- `describeImageSourceAvailability({ env })` → `{ status: "executable", providers: ["fal"?, "pollinations", "pexels-photos"?] }`
- `hasKeyedImageProvider(env)` → boolean (true if FAL or Pexels photo key present; Pollinations free doesn't count)
- **Cascade factory**: `createDefaultImageSourceCascade({ env, fetchImpl, onWarning })` → multi-source adapter
  - Order: FAL (if key) → Pollinations (always) → Pexels photos (if key)
  - Each stage fail-open to next with warning callback
- **Individual adapters**:
  - `createFalImageAdapter({ env, fetchImpl })` → `{ provider: "fal", model: "fal-ai/flux/schnell", generateImage({ prompt, stylePreset, width, height, seed, outputPath, signal }) }`
  - `createPollinationsImageAdapter({ fetchImpl })` → `{ provider: "pollinations", model: "flux", generateImage(...) }`
  - `createPexelsImageAdapter({ env, fetchImpl })` → `{ provider: "pexels-photos", generateImage(...) }` (searches photos by prompt)
- **Cascade pattern**: `createImageSourceCascade(adapters, { onWarning })` — loops through adapters until one succeeds
- Returns `{ path, sha256, bytes, width, height, license, provenance: { source: "generated" | "stock", provider, model?, promptSha256?, seed?, photoId?, author?, url? } }`

**Validation**:
- Prompt required, trimmed to MAX_PROMPT_CHARS=1200 (Pollinations: 800)
- Width/height: 1..MAX_DIMENSION=2048
- Seed: non-negative safe integer
- Output path: safe generated path
- Magic bytes: PNG_MAGIC or JPEG_MAGIC enforced for FAL/Pollinations

**Quotas**:
- MAX_IMAGE_BYTES = 20 MB
- MAX_RESPONSE_BYTES = 512 KB (FAL/Pexels search)
- REQUEST_TIMEOUT_MS = 90s (FAL/Pexels), DOWNLOAD_TIMEOUT_MS = 120s

**Wiring in `render-project.js:232–276`**:
```javascript
const generateVisuals = project?.brief?.generateVisuals === true || hasKeyedImageProvider();
if (scenesWithoutFootage > 0 && generateVisuals) {
  const imageAdapter = createCachedImageAdapter({
    adapter: createDefaultImageSourceCascade({ onWarning: message => footageWarnings.push(message) }),
    onWarning: ...
  });
  for (scene 1..N if no brollClip):
    if (generatedCount >= MAX_GENERATED_BACKGROUNDS=8) break;
    try {
      image = await imageAdapter.generateImage({ prompt: [topic, scene.title, first sentence], stylePreset, width, height, seed, outputPath, signal });
      backgroundImages[sceneIndex] = image;
      generatedCount++;
      footage.push({ sceneIndex, license, sha256, provenance });
    } catch (error) {
      footageWarnings.push(`background generation failed for scene X: ${error.message}`);
    }
}
```

**Key properties**:
- **Opt-in by default for generative**: only runs if `project?.brief?.generateVisuals === true` OR a keyed provider present (keeps default renders deterministic and offline-safe)
- **Cascade across 3 providers** already implemented
- **Cached**: wrapped in `createCachedImageAdapter` (see below)
- **Budget cap**: MAX_GENERATED_BACKGROUNDS=8 scenes per render
- Provenance persisted to `footage[]` with `source: "generated"` or `"stock"`

---

### 3. `src/media/asset-cache.js`

**Purpose**: Cache paid generations (images) by content-based key to avoid re-paying on re-render.

**Contract**:
- `resolveImageCacheDirectory({ env, homeDirectory })` → path (default: `~/.cache/hermest-board/generated-images`)
- `imageCacheKey({ provider, model, stylePreset, prompt, width, height, seed })` → SHA256 hex
- `createCachedImageAdapter({ adapter, cacheDirectory, env, homeDirectory, onWarning })` → wrapped adapter
  - On generateImage: check cache by key → return cached bytes/metadata if found and integrity OK → else run base adapter → store in cache → return
  - **Fail-open**: cache read/write errors → warning, live generation continues
  - Integrity check: stored `sha256` and `bytes` fields must match actual file content; mismatch → evict entry, regenerate

**Files per entry**:
- `${cacheKey}.png` — image bytes
- `${cacheKey}.json` — metadata: `{ sha256, bytes, width, height, license, provenance }`

**Atomic write**: `.partial` suffix → rename after full write

**Validation**: SHA256_PATTERN = `/^[0-9a-f]{64}$/`, SAFE_ABSOLUTE_PATH for cache dir

---

### 4. `src/media/research-sources.js`

**Not directly B-roll**, but demonstrates fail-open multi-source pattern:
- `searchResearchSources(query, options)` → `{ sources: [], warnings: [] }`
- Runs 4 parallel sources (Wikipedia, Crossref, arXiv, OpenLibrary) with `Promise.allSettled`
- Rejected promises → warnings, fulfilled → collected
- **Fail-open**: one dead source doesn't kill the whole search

**Key takeaway**: same pattern applies to B-roll cascade.

---

### 5. `src/media/render-project.js` — Full Pipeline Integration

**Current B-roll flow** (lines 188–224):
1. Check `describeBrollAvailability()` → executable if Pexels key present
2. For each scene 1..N (skip 0):
   - `fetchClip({ keywords: [topic, scene.title], orientation, minDurationSeconds, outputPath, signal })`
   - On success: store in `brollClips[sceneIndex]`, push provenance to `footage[]`
   - On null match or error: warning, continue
3. If no broll → check `generateVisuals` flag → run image cascade (FAL → Pollinations → Pexels photos)
4. Collect `backgroundImages[sceneIndex]`, push provenance to `footage[]`
5. If still no footage → deterministic `composeSceneFrames` with color background (fallback)

**Provenance structure** (already in `footage[]`):
```json
{
  "sceneIndex": 1,
  "license": "pexels" | "fal-generated" | "pollinations-generated",
  "sha256": "...",
  "provenance": {
    "source": "stock" | "generated",
    "provider": "pexels" | "fal" | "pollinations" | "pexels-photos",
    "model"?: "fal-ai/flux/schnell" | "flux",
    "promptSha256"?: "...",
    "seed"?: 123,
    "clipId"?: "...",
    "author"?: "...",
    "url"?: "https://..."
  }
}
```

**Music** (lines 277–289): optional mood-based track selection from library, ducked with narration (hardcoded `-28dB` bed in ffmpeg args).

**Scene composer** (lines 290–324):
- `composeSceneFrames({ storyboard, brief, recipe, runDir, seed, brollClips, backgroundImages, signal })`
- Returns `{ frames: [{ path, sceneIndex, startMs, endMs }], commands: [...], composer: "..." }`
- Renders per-scene PNG frames (title overlay on broll/background or color)
- **Fallback**: if composer unavailable or no footage/images → legacy text-on-color scenes (lines 325–361)

**Manifest** (lines 404–447):
- `tools` object includes `ffmpeg`, `ffprobe`, `renderer: "hermest-board-media-r1"`, `tts`, `sceneComposer?`
- `footage[]` and `music?` arrays persisted
- `qc.checks[]` includes `"broll_footage_provenance"` only if `footage.length > 0`
- Warnings accumulated in `manifest.warnings` (TTS warnings + footage warnings)

**Progress phases** (PROGRESS_MILESTONE_HANDOFF.md contract):
1. `preflight` — input validation
2. `scenes` — TTS per scene
3. `audio` — concatenation
4. `encode` — footage fetch + composition + ffmpeg (the phase where B-roll happens)
5. `finalize` — QC + manifest

---

## Current Gaps (M2 Requirements)

### 1. **No generative clip provider** (text-to-video)
- Requirement: M2 needs "generative clip" as the **first** option in cascade (if configured)
- Current: only Pexels stock video; images are generated but not clips
- **Action needed**: add adapter(s) for text-to-video APIs (e.g. FAL video, Runway, Luma, or free alternatives like Pollinations video if available)

### 2. **No unified provider contract object**
- Current: each adapter has slightly different shapes; cascade is ad-hoc per media type
- M2 requirement: every B-roll/image/video source returns a **standardized provider descriptor**:
  ```javascript
  {
    id: string,
    kind: "generative-clip" | "stock-footage" | "generated-image" | "deterministic",
    costClass: "free" | "local" | "byok",
    describeAvailability() -> { status: "missing" | "executable" | "limited", reason? },
    health() -> { ok: boolean, latencyMs?, error? },
    timeoutMs: number,
    retryPolicy?: { maxAttempts, backoffMs },
    cancellation: "abort-signal",
    contentType: "video/mp4" | "image/png" | ...,
    provenance: { source, provider, license, ... }
  }
  ```
- **Action needed**: create `src/media/broll-providers.js` with factory/registry; wrap existing adapters

### 3. **No explicit cascade order for B-roll clips**
- Current: if Pexels available → Pexels, else skip to images
- M2 requirement: **generative clip → stock clip → generated image + motion → deterministic fallback**
- **Action needed**: reorder pipeline; add image-to-video motion synthesis step (or skip to static image + Ken Burns)

### 4. **No `assetType` field in provenance**
- Current: `source: "stock" | "generated"` and `provider` are tracked, but manifest doesn't label the **type** of media per scene
- M2 requirement: UI needs to distinguish "generated-clip" vs "stock-footage" vs "generated-image-animation" vs "deterministic-composition" for each scene
- **Action needed**: add `assetType` field to `footage[]` entries and manifest; populate from provider `kind`

### 5. **No deterministic composition provenance**
- Current: when no footage/images → legacy color scenes, but this isn't tracked in `footage[]`
- M2 requirement: even deterministic fallback should have provenance entry with `assetType: "deterministic-composition"`
- **Action needed**: when falling back to color scenes, push a synthetic provenance entry per scene

### 6. **No magic-byte or MIME validation for video clips**
- Current: Pexels clips trusted as-is (no magic-byte check like images have PNG/JPEG validation)
- M2 requirement: robust quotas + size limits + safe file handling
- **Action needed**: add MP4 magic-byte check (0x00 0x00 0x00 [14-20] 0x66 0x74 0x79 0x70...), validate before feeding to ffmpeg

### 7. **No B-roll mode selector**
- Current: single fixed mode ("stock video if key present, else images if opted in, else deterministic")
- M2 requirement: user can pick a B-roll mode (e.g. "free", "premium", "deterministic-only", "custom-cascade")
- **Action needed**: expose mode in project brief schema; map mode to cascade order; document field names for frontend lane

### 8. **No per-scene `assetType` in render result**
- Current: `manifest.footage[]` has flat list of provenance, but no easy per-scene lookup
- M2 requirement: render result/manifest must expose **per-scene** `assetType` so frontend can label each scene in the timeline UI
- **Action needed**: extend manifest with `scenes: [{ sceneIndex, assetType, footageRef }]` or embed `assetType` directly in storyboard/composition metadata

---

## Frontend Lane Contract (field names for UI)

**To be defined after implementation**. Frontend lane needs:

1. **Project brief**:
   - `brief.brollMode?: "auto" | "free" | "premium" | "deterministic" | "custom"`
   - `brief.generateVisuals?: boolean` (keep existing opt-in flag, but may be overridden by mode)

2. **Render result / manifest**:
   - `manifest.footage[].assetType: "generative-clip" | "stock-footage" | "generated-image-animation" | "deterministic-composition"`
   - Per-scene lookup: either `manifest.scenes[sceneIndex].assetType` or join on `footage[].sceneIndex`

3. **Availability descriptor** (for UI to show which modes are possible):
   - `GET /api/v1/broll-availability` → `{ modes: [{ id: "free", available: true, providers: ["pollinations"] }, { id: "premium", available: false, reason: "No FAL key" }, ...] }`

**Exact field names and API shape will be documented in this file after backend implementation is complete.**

---

## Existing Test Coverage

- `test/unit/broll-source.test.mjs` — 5.7 KB (Pexels adapter unit tests)
- `test/unit/image-source.test.mjs` — 13.9 KB (FAL, Pollinations, Pexels photo unit tests + cascade)
- `test/unit/asset-cache.test.mjs` — 5.8 KB (cache key, integrity, fail-open)
- `test/unit/scene-frames.test.mjs` — 6.2 KB (composition with broll/backgrounds)
- `test/unit/composed-render.test.mjs` — 19.2 KB (full render with broll/images/music)
- `test/integration/render-project.test.mjs` — full end-to-end smoke with real ffmpeg

**Pattern**: narrow unit tests with mocked fetch, then one integration smoke with real tools.

---

## Implementation Plan (Backend Lane Only)

### Step 1: Unified Provider Contract (`src/media/broll-providers.js`)

- Define `BrollProviderDescriptor` shape (id, kind, costClass, describeAvailability, health, timeoutMs, contentType)
- Factory: `createBrollProviderRegistry({ env, fetchImpl, onWarning })` → registry with `.getProvider(id)` and `.describeModes()`
- Wrap existing adapters:
  - `pexels-stock-video` → kind="stock-footage", costClass="byok"
  - `fal-image` → kind="generated-image", costClass="byok"
  - `pollinations-image` → kind="generated-image", costClass="free"
  - `pexels-photo` → kind="generated-image", costClass="byok" (but source="stock" in provenance)
  - `deterministic-fallback` → kind="deterministic", costClass="free" (synthetic provider, no fetch)
- **Test**: narrow unit test for registry shape, describeAvailability for each

### Step 2: Generative Clip Provider (if feasible)

- Research free/BYOK text-to-video APIs (FAL video, Pollinations video, Luma, Replicate, Runway)
- If FREE option exists → add adapter as `kind="generative-clip", costClass="free"`
- Else → add placeholder adapter that returns `describeAvailability: { status: "missing", reason: "No generative clip provider configured" }`
- **Test**: mock adapter, ensure returns video file with MP4 magic bytes

### Step 3: Fail-Open Cascade for B-roll Clips

- Refactor `render-project.js` b-roll loop to use registry cascade: `generativeClipProvider → stockFootageProvider → (imageProvider + motion) → deterministicFallback`
- Each stage:
  - Try provider
  - On success: store in `brollClips[sceneIndex]`, push `{ sceneIndex, assetType: provider.kind, license, sha256, provenance }` to `footage[]`
  - On failure: log warning, continue to next
- **Test**: mock all providers to fail except last → assert fallback reached; mock first to succeed → assert rest skipped

### Step 4: Add `assetType` Field

- Modify `footage[]` entries to include `assetType: provider.kind`
- When falling back to deterministic color scenes → push synthetic `footage` entry: `{ sceneIndex, assetType: "deterministic-composition", license: "n/a", sha256: null, provenance: { source: "deterministic", provider: "hermest-board-scene-composer" } }`
- **Test**: assert `footage[].assetType` matches expected cascade outcome

### Step 5: Magic-Byte Validation for Video Clips

- Add `assertVideoMagic(bytes)` helper (check MP4 ftyp box: `bytes[4..7] === "ftyp"`)
- Validate Pexels (and any generative clip) downloads before writing to disk
- Throw on invalid magic → fail-open to next provider
- **Test**: feed non-MP4 bytes → assert throws or cascades

### Step 6: Per-Scene `assetType` in Manifest

- Option A: add `manifest.scenes[sceneIndex].assetType` (requires extending manifest schema)
- Option B: keep flat `footage[]` array but add quick lookup helper in frontend
- **Decision**: use Option A for clarity
- Extend `buildRenderManifest` to include `scenes: storyboard.scenes.map((scene, i) => ({ sceneIndex: i, title: scene.title, assetType: footage.find(f => f.sceneIndex === i)?.assetType || "deterministic-composition" }))`
- **Test**: assert `manifest.scenes[1].assetType === "stock-footage"` when Pexels used

### Step 7: B-roll Mode Selector (Project Brief Extension)

- Add `brief.brollMode?: "auto" | "free" | "premium" | "deterministic" | "custom"` to schema validation
- Map mode to cascade order:
  - `"auto"` → smart order (generative → stock → images → deterministic), skip unavailable providers
  - `"free"` → only free providers (Pollinations, deterministic)
  - `"premium"` → only BYOK providers (FAL, Pexels)
  - `"deterministic"` → skip all external sources, use color scenes only
  - `"custom"` → user-provided `brief.brollProviders: string[]` array (provider IDs)
- Pass mode to registry → `registry.buildCascade(mode)` → ordered adapter list
- **Test**: mode="free" → assert only Pollinations + deterministic used; mode="deterministic" → assert no fetch calls

### Step 8: ONE Real Free/Local Smoke Test

- Extend `test/integration/render-project.test.mjs` with a "free-only" variant:
  - Mock `brief.brollMode = "free"`
  - Assert Pollinations image OR deterministic fallback used (no paid key required)
  - Assert manifest includes valid `footage[].assetType` and `scenes[].assetType`
  - Assert MP4 produced with correct duration
- **Test**: `npm run test:media` must pass (existing smoke already covers basic render; this adds free-tier coverage)

### Step 9: Document Frontend Contract

- Write final field names and API shapes in this file under "Frontend Lane Contract" section
- Example:
  ```json
  {
    "brief": { "brollMode": "auto", "generateVisuals": true },
    "manifest": {
      "footage": [
        { "sceneIndex": 1, "assetType": "stock-footage", "license": "pexels", "sha256": "...", "provenance": {...} }
      ],
      "scenes": [
        { "sceneIndex": 0, "title": "Intro", "assetType": "deterministic-composition" },
        { "sceneIndex": 1, "title": "Main", "assetType": "stock-footage" }
      ]
    }
  }
  ```

---

## Blockers

None identified yet. If a free generative-clip provider is not found, Step 2 will be skipped (no generative clips in cascade), but the rest of the plan proceeds with stock → images → deterministic.

---

## Next Steps

1. Implement Step 1 (unified contract + registry) with narrow unit test
2. Implement Step 3 (cascade refactor) with mock providers
3. Implement Step 4 (assetType field) with assertions
4. Implement Step 5 (magic-byte validation) with test
5. Implement Step 6 (per-scene assetType in manifest) with test
6. Implement Step 7 (mode selector) with test
7. Implement Step 8 (one real free smoke test)
8. Run full `npm run check` (validate + test:unit + smoke:api + test:media + build + smoke)
9. Document final frontend contract
10. Commit atomically per green test; no `git push`; write blockers if any external dependency unavailable
