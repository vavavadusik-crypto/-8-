import assert from "node:assert/strict";
import test from "node:test";

import {
  getMediaToolDescriptor,
  runMediaTool
} from "../../src/media/process-runner.js";

test("media tools use absolute allowlisted binaries and a credential-free environment", () => {
  const descriptor = getMediaToolDescriptor("ffmpeg");

  assert.equal(descriptor.path, "/usr/bin/ffmpeg");
  assert.ok(Object.keys(descriptor.env).length > 0);
  for (const key of Object.keys(descriptor.env)) {
    assert.doesNotMatch(key, /TOKEN|KEY|SECRET|PASSWORD|AUTH|GH_|GITHUB/i);
  }
  assert.throws(() => getMediaToolDescriptor("bash"), /Unsupported media tool/);
});

test("media tool runner rejects a pre-aborted signal before process execution", async () => {
  const controller = new AbortController();
  controller.abort(new Error("operator cancelled render"));

  await assert.rejects(
    () => runMediaTool("ffprobe", ["-version"], { signal: controller.signal }),
    /operator cancelled render|aborted/i
  );
});
