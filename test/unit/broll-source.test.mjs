import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createPexelsBrollAdapter,
  describeBrollAvailability,
  selectPexelsClip
} from "../../src/media/broll-source.js";

const searchPayload = Object.freeze({
  videos: [
    {
      id: 101,
      duration: 12,
      url: "https://www.pexels.com/video/101/",
      user: { name: "Автор Один" },
      video_files: [
        { link: "https://videos.pexels.com/101-small.mp4", width: 960, height: 540 },
        { link: "https://videos.pexels.com/101-hd.mp4", width: 1920, height: 1080 }
      ]
    },
    {
      id: 202,
      duration: 3,
      url: "https://www.pexels.com/video/202/",
      user: { name: "Автор Два" },
      video_files: [
        { link: "https://videos.pexels.com/202-4k.mp4", width: 3840, height: 2160 }
      ]
    }
  ]
});

test("availability is honest without a key and executable with one", () => {
  assert.equal(describeBrollAvailability({ env: {} }).status, "missing");
  assert.equal(describeBrollAvailability({ env: { HERMEST_PEXELS_API_KEY: "k" } }).status, "executable");
});

test("clip selection prefers long-enough clips, then coverage, and honors orientation", () => {
  const clip = selectPexelsClip(searchPayload, { orientation: "landscape", minDurationSeconds: 5 });
  assert.equal(clip.clipId, "101");
  assert.equal(clip.fileUrl, "https://videos.pexels.com/101-hd.mp4");
  const shortOk = selectPexelsClip(searchPayload, { orientation: "landscape", minDurationSeconds: 60 });
  assert.equal(shortOk.clipId, "202");
  assert.equal(selectPexelsClip(searchPayload, { orientation: "portrait", minDurationSeconds: 5 }), null);
  assert.equal(selectPexelsClip({ videos: [] }, { orientation: "landscape", minDurationSeconds: 5 }), null);
});

test("adapter downloads the selected clip with hash and provenance", async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), "broll-test-"));
  try {
    const clipBytes = Buffer.from("fake-mp4-bytes");
    const requests = [];
    const fetchImpl = async (url, options) => {
      requests.push({ url: String(url), headers: options?.headers });
      if (String(url).startsWith("https://api.pexels.com/")) {
        const bytes = Buffer.from(JSON.stringify(searchPayload), "utf8");
        return {
          ok: true,
          status: 200,
          text: async () => bytes.toString("utf8"),
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        };
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => clipBytes.buffer.slice(clipBytes.byteOffset, clipBytes.byteOffset + clipBytes.length)
      };
    };
    const adapter = createPexelsBrollAdapter({
      env: { HERMEST_PEXELS_API_KEY: "test-key" },
      fetchImpl
    });
    const outputPath = path.join(runDir, "broll-002.mp4");
    const clip = await adapter.fetchClip({
      keywords: ["История ИИ", "Обучение на данных"],
      orientation: "landscape",
      minDurationSeconds: 5,
      outputPath
    });
    assert.equal(clip.path, outputPath);
    assert.equal(clip.license, "pexels");
    assert.equal(clip.provenance.provider, "pexels");
    assert.equal(clip.provenance.author, "Автор Один");
    assert.match(clip.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(await readFile(outputPath), clipBytes);
    assert.equal(requests[0].headers.Authorization, "test-key");
    assert.ok(requests[0].url.includes("orientation=landscape"));
    assert.ok(!requests[1].headers);
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("adapter fails closed on auth errors and oversized responses", async () => {
  const adapter = createPexelsBrollAdapter({
    env: { HERMEST_PEXELS_API_KEY: "bad-key" },
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => "" })
  });
  await assert.rejects(
    adapter.fetchClip({
      keywords: "space",
      orientation: "landscape",
      minDurationSeconds: 4,
      outputPath: "/tmp/broll-auth-test.mp4"
    }),
    /rejected the API key/
  );
  const oversized = createPexelsBrollAdapter({
    env: { HERMEST_PEXELS_API_KEY: "k" },
    fetchImpl: async () => {
      const bytes = Buffer.from(`{"videos": ["${"x".repeat(600000)}"]}`, "utf8");
      return {
        ok: true,
        status: 200,
        text: async () => bytes.toString("utf8"),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      };
    }
  });
  await assert.rejects(
    oversized.fetchClip({
      keywords: "space",
      orientation: "landscape",
      minDurationSeconds: 4,
      outputPath: "/tmp/broll-oversize-test.mp4"
    }),
    /exceeds the allowed size/
  );
});

test("adapter validates keywords, duration and requires a key", async () => {
  const adapter = createPexelsBrollAdapter({ env: { HERMEST_PEXELS_API_KEY: "k" }, fetchImpl: async () => { throw new Error("must not fetch"); } });
  await assert.rejects(adapter.fetchClip({
    keywords: "!!!///",
    orientation: "landscape",
    minDurationSeconds: 4,
    outputPath: "/tmp/broll-kw-test.mp4"
  }), /keywords are required/);
  await assert.rejects(adapter.fetchClip({
    keywords: "space",
    orientation: "landscape",
    minDurationSeconds: 0,
    outputPath: "/tmp/broll-dur-test.mp4"
  }), /minDurationSeconds/);
  const keyless = createPexelsBrollAdapter({ env: {}, fetchImpl: async () => { throw new Error("must not fetch"); } });
  await assert.rejects(keyless.fetchClip({
    keywords: "space",
    orientation: "landscape",
    minDurationSeconds: 4,
    outputPath: "/tmp/broll-key-test.mp4"
  }), /key is not configured/);
});
