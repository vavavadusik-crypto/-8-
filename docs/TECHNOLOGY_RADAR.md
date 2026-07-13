# Hermest Board — Technology Radar

Observed: 2026-07-13
Status: RESEARCH RECOMMENDATION / LIVE SPIKES REQUIRED

Board owns `RenderSpec`, job state, artifact manifest and approval semantics. Libraries/providers remain adapters.

## Adopt now

| Component | License | Decision | Boundary |
|---|---|---|---|
| FFmpeg/ffprobe | LGPL-2.1-or-later; actual build flags matter | ADOPT external executable | safe argv, pinned/runtime inventory, no shell interpolation |
| Openverse API | code MIT; media licenses per item | ADOPT media-source adapter | provenance, author/license URL, allowlist and rights gate |
| pg-boss | MIT | ADOPT later behind `QueuePort` | Board DB remains source of truth; queue is delivery |
| Mediabunny | MIT | ADOPT after browser spike | client metadata/thumbnail/preview, not production render authority |

## Adapter candidates

| Component | License | Fit | Required spike |
|---|---|---|---|
| Revideo | MIT | programmatic TS/Node timeline renderer | same 30s project to 16:9/9:16; RAM/time/cancel/repeat |
| sherpa-onnx | Apache-2.0 runtime; model terms separate | offline multilingual TTS/STT boundary | RU/EN quality, CPU realtime factor, pronunciation, per-model license |
| faster-whisper | MIT | transcript and word timestamps | RU/EN fixtures, int8 CPU, cancel/malformed/memory limits |
| PySceneDetect | BSD-3-Clause | scene boundaries for semantic shorts | labeled precision/recall plus transcript-aware cuts |

## Study only

- Remotion: strong product/DX benchmark, but current license is not OSI-approved; separate commercial decision required.
- Motion Canvas: MIT animation DSL, not a full product job/timeline system.
- WebAV: MIT browser editor ideas; worker remains export authority.
- Editly: study declarative FFmpeg patterns; do not make core without maintenance review.
- ClipsAI/WhisperX: heuristics/alignment study behind optional adapters.
- BullMQ/Graphile Worker: queue alternatives if infrastructure changes.

## Reject as production core

- `fluent-ffmpeg`: deprecated/archived abstraction; direct spawn is clearer and safer.
- `ffmpeg.wasm`: browser RAM/threads/download constraints; preview experiment only.
- undocumented `edge-tts`: endpoint/ToS/availability risk.
- GPL/AGPL editors or Piper GPL code copied into proprietary core; only separately reviewed process/service boundary where legally approved.

## Decisions

1. Media bytes never pass through Vercel Functions.
2. First tracer uses raw FFmpeg; Revideo is optional after benchmark, not a prerequisite.
3. Semantic shorts combine scene boundaries, transcript timestamps, scorer, platform recipe and human review.
4. Rights/provenance follow every derived artifact.
5. Record `ffmpeg -buildconf`, binary version and notices because effective license depends on build configuration.
6. Runtime license and model-weight license are reviewed independently.

Sources:

- https://github.com/FFmpeg/FFmpeg
- https://github.com/redotvideo/revideo
- https://github.com/Vanilagy/mediabunny
- https://github.com/k2-fsa/sherpa-onnx
- https://github.com/SYSTRAN/faster-whisper
- https://github.com/Breakthrough/PySceneDetect
- https://github.com/WordPress/openverse
- https://github.com/timgit/pg-boss
