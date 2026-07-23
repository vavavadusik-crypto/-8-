import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runBrollCascade } from "../../src/media/render-project.js";

describe("broll-cascade — fail-open provider chain", () => {
  it("runBrollCascade returns first success with assetType", async () => {
    const mockProviders = [
      {
        id: "mock-fail",
        kind: "stock-footage",
        async fetchMedia() {
          throw new Error("mock provider 1 failed");
        }
      },
      {
        id: "mock-success",
        kind: "generated-image",
        async fetchMedia() {
          return {
            path: "/tmp/fake.png",
            sha256: "abc123",
            bytes: 1024,
            width: 1920,
            height: 1080,
            license: "mock-generated",
            provenance: { source: "generated", provider: "mock-success" }
          };
        }
      }
    ];

    const warnings = [];
    const result = await runBrollCascade({
      providers: mockProviders,
      request: { prompt: "test", width: 1920, height: 1080, outputPath: "/tmp/out.png", signal: null },
      onWarning: msg => warnings.push(msg)
    });

    assert.ok(result !== null, "cascade returns result");
    assert.strictEqual(result.path, "/tmp/fake.png", "result path correct");
    assert.strictEqual(result.assetType, "generated-image", "assetType set from provider kind");
    assert.strictEqual(warnings.length, 1, "one warning for failed provider");
    assert.ok(warnings[0].includes("mock-fail"), "warning mentions failed provider");
  });

  it("runBrollCascade returns null if all providers fail", async () => {
    const mockProviders = [
      {
        id: "mock-fail-1",
        kind: "stock-footage",
        async fetchMedia() {
          throw new Error("mock provider 1 failed");
        }
      },
      {
        id: "mock-fail-2",
        kind: "generated-image",
        async fetchMedia() {
          throw new Error("mock provider 2 failed");
        }
      }
    ];

    const warnings = [];
    const result = await runBrollCascade({
      providers: mockProviders,
      request: { prompt: "test", width: 1920, height: 1080, outputPath: "/tmp/out.png", signal: null },
      onWarning: msg => warnings.push(msg)
    });

    assert.strictEqual(result, null, "cascade returns null when all fail");
    assert.strictEqual(warnings.length, 2, "warnings for all failed providers");
  });

  it("runBrollCascade skips remaining providers after success", async () => {
    let call2 = false;
    const mockProviders = [
      {
        id: "mock-success",
        kind: "stock-footage",
        async fetchMedia() {
          return {
            path: "/tmp/clip.mp4",
            sha256: "xyz789",
            bytes: 2048,
            durationSeconds: 5,
            license: "pexels",
            provenance: { source: "stock", provider: "pexels" }
          };
        }
      },
      {
        id: "mock-never-called",
        kind: "generated-image",
        async fetchMedia() {
          call2 = true;
          throw new Error("should not reach here");
        }
      }
    ];

    const warnings = [];
    const result = await runBrollCascade({
      providers: mockProviders,
      request: { keywords: ["test"], orientation: "landscape", minDurationSeconds: 3, outputPath: "/tmp/out.mp4", signal: null },
      onWarning: msg => warnings.push(msg)
    });

    assert.ok(result !== null, "cascade returns result");
    assert.strictEqual(result.assetType, "stock-footage", "assetType from first provider");
    assert.strictEqual(call2, false, "second provider never called");
    assert.strictEqual(warnings.length, 0, "no warnings when first provider succeeds");
  });

  it("runBrollCascade handles null return (no match) as failure", async () => {
    const mockProviders = [
      {
        id: "mock-no-match",
        kind: "stock-footage",
        async fetchMedia() {
          return null; // Провайдер отработал, но не нашёл совпадения
        }
      },
      {
        id: "mock-success",
        kind: "generated-image",
        async fetchMedia() {
          return {
            path: "/tmp/fallback.png",
            sha256: "def456",
            bytes: 512,
            width: 1280,
            height: 720,
            license: "pollinations-generated",
            provenance: { source: "generated", provider: "pollinations" }
          };
        }
      }
    ];

    const warnings = [];
    const result = await runBrollCascade({
      providers: mockProviders,
      request: { prompt: "test", width: 1280, height: 720, outputPath: "/tmp/out.png", signal: null },
      onWarning: msg => warnings.push(msg)
    });

    assert.ok(result !== null, "cascade falls through to next provider");
    assert.strictEqual(result.path, "/tmp/fallback.png", "result from second provider");
    assert.strictEqual(result.assetType, "generated-image", "assetType from fallback provider");
    assert.strictEqual(warnings.length, 1, "warning for no-match provider");
    assert.ok(warnings[0].includes("no match"), "warning mentions no match");
  });

  it("runBrollCascade respects AbortSignal", async () => {
    const controller = new AbortController();
    const mockProviders = [
      {
        id: "mock-aborted",
        kind: "stock-footage",
        async fetchMedia({ signal }) {
          await new Promise(resolve => setTimeout(resolve, 10));
          signal?.throwIfAborted();
          throw new Error("should not reach here");
        }
      }
    ];

    controller.abort();

    const warnings = [];
    await assert.rejects(
      async () => runBrollCascade({
        providers: mockProviders,
        request: { keywords: ["test"], orientation: "landscape", minDurationSeconds: 3, outputPath: "/tmp/out.mp4", signal: controller.signal },
        onWarning: msg => warnings.push(msg)
      }),
      /abort/i,
      "cascade throws on abort"
    );
  });
});
