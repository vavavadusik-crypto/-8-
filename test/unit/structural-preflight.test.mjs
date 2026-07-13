import assert from "node:assert/strict";
import test from "node:test";

import { validateJsonStructure } from "../../src/media/structural-preflight.js";

test("structural preflight enforces depth, node, array and string budgets", () => {
  assert.throws(
    () => validateJsonStructure({ a: { b: { c: true } } }, { maxDepth: 2 }),
    /maximum depth/i
  );
  assert.throws(
    () => validateJsonStructure({ a: 1, b: 2, c: 3 }, { maxNodes: 3 }),
    /maximum node count/i
  );
  assert.throws(
    () => validateJsonStructure([1, 2, 3], { maxArrayLength: 2 }),
    /maximum length/i
  );
  assert.throws(
    () => validateJsonStructure({ text: "абв" }, { maxTotalStringBytes: 5 }),
    /strings exceed/i
  );
});

test("structural preflight rejects executable, polluted and non-JSON shapes", () => {
  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, get: () => "unsafe" });
  assert.throws(() => validateJsonStructure(accessor), /accessor property/i);
  assert.throws(() => validateJsonStructure(new Date()), /non-plain object/i);
  assert.throws(() => validateJsonStructure({ constructor: "unsafe" }), /forbidden key/i);
  assert.throws(() => validateJsonStructure({ number: Number.NaN }), /non-finite number/i);
  assert.throws(() => validateJsonStructure({ missing: undefined }), /unsupported undefined/i);
});

test("structural preflight reports bounded valid JSON", () => {
  const report = validateJsonStructure({ title: "Board", cards: [{ id: "one" }] });
  assert.ok(report.nodes > 0);
  assert.ok(report.stringBytes > 0);
  assert.equal(report.maxDepth, 64);
});
