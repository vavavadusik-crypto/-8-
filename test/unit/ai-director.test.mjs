import assert from "node:assert/strict";
import test from "node:test";

import { draftBoardFromTopic, extractJsonPayload, buildDirectorPrompt } from "../../src/domain/ai-director.js";
import { buildStoryboard } from "../../src/domain/content-pipeline.js";

const validDraft = {
  title: "Квантовые компьютеры простыми словами",
  cards: [
    { title: "Обычные биты", text: "Классический компьютер оперирует нулями и единицами." },
    { title: "Кубиты", text: "Кубит может находиться в суперпозиции состояний." },
    { title: "Запутанность", text: "Связанные кубиты меняют состояние согласованно." }
  ]
};

function mockModel(responses) {
  const calls = [];
  return {
    calls,
    async complete({ system, prompt }) {
      calls.push({ system, prompt });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    }
  };
}

test("director drafts a renderable board from a topic via the text model", async () => {
  const model = mockModel([JSON.stringify(validDraft)]);
  const board = await draftBoardFromTopic({
    topic: "Квантовые компьютеры простыми словами",
    language: "ru",
    sceneCount: 3,
    textModel: model
  });
  assert.equal(board.schemaVersion, 1);
  assert.equal(board.brief.topic, "Квантовые компьютеры простыми словами");
  assert.equal(board.brief.language, "ru");
  assert.equal(board.cards.length, 3);
  for (const card of board.cards) {
    assert.match(card.id, /^[a-z0-9-]+$/);
    assert.equal(typeof card.x, "number");
    assert.equal(typeof card.y, "number");
    assert.ok(card.title.length > 0);
    assert.ok(card.text.length > 0);
  }
  const storyboard = buildStoryboard(board);
  assert.equal(storyboard.scenes.length, 3);
  assert.match(model.calls[0].prompt, /Квантовые компьютеры/);
  assert.match(model.calls[0].prompt, /JSON/);
});

test("director unwraps markdown code fences web chats love to add", () => {
  const fenced = "Вот ваш план:\n```json\n" + JSON.stringify(validDraft) + "\n```\nУдачи!";
  const payload = extractJsonPayload(fenced);
  assert.equal(payload.title, validDraft.title);
  assert.equal(payload.cards.length, 3);
  assert.equal(extractJsonPayload("никакого джейсона тут нет"), null);
});

test("director retries once with the validation error, then fails honestly", async () => {
  const retried = mockModel(["это не json", JSON.stringify(validDraft)]);
  const board = await draftBoardFromTopic({
    topic: "тема",
    textModel: retried,
    sceneCount: 3
  });
  assert.equal(retried.calls.length, 2);
  assert.match(retried.calls[1].prompt, /повтор|ошибк|json/i);
  assert.equal(board.cards.length, 3);

  const hopeless = mockModel(["мусор", "снова мусор"]);
  await assert.rejects(
    draftBoardFromTopic({ topic: "тема", textModel: hopeless, sceneCount: 3 }),
    /draft/i
  );
});

test("director fails closed on empty topics and unusable cards", async () => {
  await assert.rejects(
    draftBoardFromTopic({ topic: "   ", textModel: mockModel([]) }),
    /topic/i
  );
  const emptyCards = mockModel([
    JSON.stringify({ title: "x", cards: [] }),
    JSON.stringify({ title: "x", cards: [] })
  ]);
  await assert.rejects(
    draftBoardFromTopic({ topic: "тема", textModel: emptyCards }),
    /draft/i
  );
});

test("director prompt pins language, scene count and contract", () => {
  const prompt = buildDirectorPrompt({ topic: "Тёмная материя", language: "de", sceneCount: 4 });
  assert.match(prompt, /Тёмная материя/);
  assert.match(prompt, /\bde\b/);
  assert.match(prompt, /4/);
  assert.match(prompt, /"cards"/);
});
