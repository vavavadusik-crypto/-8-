import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNarrationScript,
  buildStoryboard,
  reconcileStoryboardDuration
} from "../../src/domain/content-pipeline.js";

const board = {
  title: "История искусственного интеллекта",
  cards: [
    {
      id: "ending",
      x: 700,
      y: 500,
      title: "Что дальше",
      text: "ИИ становится повседневным инструментом.",
      sourceRefs: ["source-2"]
    },
    {
      id: "opening",
      x: 100,
      y: 100,
      title: "Начало",
      text: "Первые идеи появились задолго до современных моделей.",
      sourceRefs: ["source-1"]
    },
    {
      id: "middle",
      x: 500,
      y: 100,
      title: "Новый этап",
      text: "Машинное обучение изменило подход к программированию.",
      sourceRefs: []
    }
  ]
};

test("buildStoryboard orders current board cards spatially and preserves source lineage", () => {
  const storyboard = buildStoryboard(board, {
    minSceneDurationMs: 2500,
    wordsPerMinute: 150
  });

  assert.equal(storyboard.schemaVersion, 1);
  assert.equal(storyboard.title, board.title);
  assert.deepEqual(storyboard.scenes.map(scene => scene.cardId), [
    "opening",
    "middle",
    "ending"
  ]);
  assert.equal(storyboard.scenes[0].id, "scene-opening");
  assert.equal(storyboard.scenes[0].narration, "Начало. Первые идеи появились задолго до современных моделей.");
  assert.deepEqual(storyboard.scenes[0].sourceRefs, ["source-1"]);
  assert.ok(storyboard.scenes.every(scene => scene.durationMs >= 2500));
});

test("buildNarrationScript is derived only from scene content without hidden boilerplate", () => {
  const script = buildNarrationScript(buildStoryboard(board));

  assert.match(script, /^Начало\. Первые идеи/);
  assert.match(script, /Что дальше\. ИИ становится/);
  assert.doesNotMatch(script, /История искусственного интеллекта|Hermest|оболочк/i);
});

test("buildStoryboard rejects a board without renderable cards", () => {
  assert.throws(
    () => buildStoryboard({ title: "Пусто", cards: [] }),
    /at least one renderable card/
  );
});

test("reconcileStoryboardDuration scales scene timing to measured narration", () => {
  const reconciled = reconcileStoryboardDuration({
    schemaVersion: 1,
    scenes: [
      { id: "a", durationMs: 2500 },
      { id: "b", durationMs: 3000 }
    ]
  }, 11000);

  assert.equal(reconciled.scenes.reduce((total, scene) => total + scene.durationMs, 0), 11000);
  assert.ok(reconciled.scenes.every(scene => scene.durationMs >= 250));
  assert.ok(reconciled.scenes[1].durationMs > reconciled.scenes[0].durationMs);
  assert.equal(reconciled.measuredDurationMs, 11000);
});

test("storyboard enforces bounded card and narration input", () => {
  assert.throws(
    () => buildStoryboard({
      title: "Too many",
      cards: Array.from({ length: 201 }, (_, index) => ({ id: `c-${index}`, text: "ok" }))
    }),
    /card limit/
  );
  assert.throws(
    () => buildStoryboard({ title: "Too long", cards: [{ id: "a", text: "x".repeat(20001) }] }),
    /text limit/
  );
  assert.throws(
    () => buildStoryboard({ title: "Bad\u0000title", cards: [{ id: "a", text: "ok" }] }),
    /control characters/
  );
  assert.throws(
    () => buildStoryboard({ schemaVersion: 99, title: "Future", cards: [{ id: "a", text: "ok" }] }),
    /Unsupported board schemaVersion/
  );
});

test("storyboard assigns sorted order and rejects normalized id collisions", () => {
  const storyboard = buildStoryboard({
    title: "Order",
    cards: [
      { id: "later", x: 0, y: 100, text: "Later" },
      { id: "first", x: 0, y: 0, text: "First" }
    ]
  });
  assert.deepEqual(storyboard.scenes.map(scene => scene.order), [1, 2]);
  assert.throws(
    () => buildStoryboard({
      title: "Collision",
      cards: [
        { id: "A B", x: 0, y: 0, text: "One" },
        { id: "a-b", x: 1, y: 0, text: "Two" }
      ]
    }),
    /normalized card id collision/
  );
});

test("duration reconciliation preserves a practical minimum for every scene", () => {
  const input = {
    schemaVersion: 1,
    scenes: [
      { id: "a", durationMs: 1 },
      { id: "b", durationMs: 1 },
      { id: "c", durationMs: 1 }
    ]
  };
  assert.throws(() => reconcileStoryboardDuration(input, 749), /shorter than scene minimum/);
  assert.deepEqual(
    reconcileStoryboardDuration(input, 750).scenes.map(scene => scene.durationMs),
    [250, 250, 250]
  );
});
