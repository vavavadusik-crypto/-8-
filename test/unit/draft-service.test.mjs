import assert from "node:assert/strict";
import test from "node:test";

import { draftBoardService } from "../../src/local-media/draft-service.js";

const PLAN_JSON = JSON.stringify({
  title: "T",
  cards: [
    { title: "a", text: "aa" },
    { title: "b", text: "bb" }
  ]
});

function mockTextModel() {
  const calls = [];
  return {
    calls,
    async complete({ prompt }) {
      calls.push(prompt);
      return PLAN_JSON;
    }
  };
}

function executableBridge() {
  return async () => ({ status: "executable", provider: "browser-bridge" });
}

function countingResearch(result) {
  const state = { calls: 0 };
  state.search = async query => {
    state.calls += 1;
    state.lastQuery = query;
    if (result instanceof Error) throw result;
    return result;
  };
  return state;
}

test("draft service composes research sources into a renderable board", async () => {
  const research = countingResearch({
    sources: [
      { id: "src-wikipedia-1", source: "wikipedia", title: "Quantum computing", url: "https://en.wikipedia.org/wiki/Quantum_computing" },
      { id: "src-arxiv-1", source: "arxiv", title: "Quantum supremacy", url: "https://arxiv.org/abs/1910.11333", year: 2019 }
    ],
    warnings: ["crossref: timeout"]
  });
  const textModel = mockTextModel();

  const result = await draftBoardService({
    topic: "Квантовые компьютеры простыми словами",
    sceneCount: 2,
    textModel,
    researchSearch: research.search,
    availabilityCheck: executableBridge()
  });

  assert.equal(research.calls, 1);
  assert.equal(research.lastQuery, "Квантовые компьютеры простыми словами");
  assert.ok(result.board.cards.length >= 2);
  assert.equal(result.board.brief.language, "ru");
  assert.equal(result.sources.length, 2);
  assert.ok(Array.isArray(result.warnings));
  assert.deepEqual(result.warnings, ["crossref: timeout"]);
  assert.match(textModel.calls[0], /src-wikipedia-1/);
});

test("draft service skips research entirely when it is disabled", async () => {
  const research = countingResearch({ sources: [], warnings: [] });

  const result = await draftBoardService({
    topic: "Тёмная материя",
    sceneCount: 2,
    research: false,
    textModel: mockTextModel(),
    researchSearch: research.search,
    availabilityCheck: executableBridge()
  });

  assert.equal(research.calls, 0, "disabled research must not hit the network path");
  assert.ok(result.board.cards.length >= 2);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.board.sources, undefined);
});

test("draft service stays fail-open when research blows up", async () => {
  const research = countingResearch(new Error("all providers unreachable"));

  const result = await draftBoardService({
    topic: "Как работает GPS",
    sceneCount: 2,
    textModel: mockTextModel(),
    researchSearch: research.search,
    availabilityCheck: executableBridge()
  });

  assert.equal(research.calls, 1);
  assert.ok(result.board.cards.length >= 2);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /research failed: all providers unreachable/);
});

test("draft service fails closed with 503 when the text bridge is down", async () => {
  const research = countingResearch({ sources: [], warnings: [] });

  await assert.rejects(
    draftBoardService({
      topic: "Любая тема",
      textModel: mockTextModel(),
      researchSearch: research.search,
      availabilityCheck: async () => ({ status: "missing", provider: "browser-bridge", reason: "browser-ai-bridge is not running" })
    }),
    error => {
      assert.equal(error.statusCode, 503);
      assert.match(error.message, /browser-ai-bridge is not running/);
      return true;
    }
  );
  assert.equal(research.calls, 0, "unavailable bridge must short-circuit before research");
});

test("draft service rejects an empty topic before touching any provider", async () => {
  const research = countingResearch({ sources: [], warnings: [] });
  let availabilityCalls = 0;

  await assert.rejects(
    draftBoardService({
      topic: "   ",
      textModel: mockTextModel(),
      researchSearch: research.search,
      availabilityCheck: async () => {
        availabilityCalls += 1;
        return { status: "executable" };
      }
    }),
    TypeError
  );
  assert.equal(availabilityCalls, 0);
  assert.equal(research.calls, 0);
});

test("draft service clamps the scene count into the renderable range", async () => {
  const textModel = mockTextModel();

  await draftBoardService({
    topic: "Слишком много сцен",
    sceneCount: 99,
    research: false,
    textModel,
    availabilityCheck: executableBridge()
  });

  assert.match(textModel.calls[0], /ровно 12 сцен/);
});
