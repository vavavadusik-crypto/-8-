import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSubtitleCues,
  formatSrt
} from "../../src/media/subtitles.js";

const storyboard = {
  scenes: [
    { id: "scene-a", narration: "Первая сцена.", durationMs: 2500 },
    { id: "scene-b", narration: "Вторая сцена.", durationMs: 3000 }
  ]
};

test("subtitle cues follow the measured storyboard timeline", () => {
  const cues = buildSubtitleCues(storyboard);

  assert.deepEqual(cues, [
    { index: 1, sceneId: "scene-a", startMs: 0, endMs: 2500, text: "Первая сцена." },
    { index: 2, sceneId: "scene-b", startMs: 2500, endMs: 5500, text: "Вторая сцена." }
  ]);
});

test("formatSrt emits valid sequential timestamps", () => {
  const srt = formatSrt(buildSubtitleCues(storyboard));

  assert.equal(
    srt,
    "1\n00:00:00,000 --> 00:00:02,500\nПервая сцена.\n\n" +
    "2\n00:00:02,500 --> 00:00:05,500\nВторая сцена.\n"
  );
});

test("subtitle cues end with the measured narration inside each scene", () => {
  const cues = buildSubtitleCues({
    scenes: [
      { id: "scene-a", narration: "Первая сцена.", durationMs: 3000, narrationDurationMs: 2600 },
      { id: "scene-b", narration: "Вторая сцена.", durationMs: 2000, narrationDurationMs: 1500 }
    ]
  });

  assert.deepEqual(cues, [
    { index: 1, sceneId: "scene-a", startMs: 0, endMs: 2600, text: "Первая сцена." },
    { index: 2, sceneId: "scene-b", startMs: 3000, endMs: 4500, text: "Вторая сцена." }
  ]);
  assert.ok(cues.every(cue => cue.endMs <= 5000));
});

test("subtitle builder rejects non-positive scene duration", () => {
  assert.throws(
    () => buildSubtitleCues({ scenes: [{ id: "bad", narration: "Ошибка", durationMs: 0 }] }),
    /positive duration/
  );
});
