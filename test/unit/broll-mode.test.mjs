import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateBrollMode } from "../../src/media/render-project.js";

describe("broll-mode — validateBrollMode", () => {
  it("accepts valid modes", () => {
    const validModes = ["auto", "free", "premium", "deterministic"];
    for (const mode of validModes) {
      assert.doesNotThrow(() => validateBrollMode(mode), `mode "${mode}" is valid`);
    }
  });

  it("accepts undefined mode (defaults to auto)", () => {
    assert.doesNotThrow(() => validateBrollMode(undefined), "undefined mode is valid");
  });

  it("rejects invalid mode", () => {
    assert.throws(
      () => validateBrollMode("unknown-mode"),
      /invalid brollMode/i,
      "unknown mode throws"
    );
  });

  it("rejects non-string mode", () => {
    assert.throws(
      () => validateBrollMode(123),
      /invalid brollMode/i,
      "non-string mode throws"
    );
    assert.throws(
      () => validateBrollMode({}),
      /invalid brollMode/i,
      "object mode throws"
    );
  });
});
