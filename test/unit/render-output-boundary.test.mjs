import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertAllowedOutputDirectory,
  assertEmptyOutputDirectory
} from "../../src/media/render-project.js";

test("render output must be a child of an explicit allowed root", () => {
  const allowedRoots = ["/tmp", "/workspace/hermest-board/tmp"];

  assert.equal(
    assertAllowedOutputDirectory("/tmp/hermest-board-run", allowedRoots),
    "/tmp/hermest-board-run"
  );
  assert.equal(
    assertAllowedOutputDirectory("/workspace/hermest-board/tmp/run-1", allowedRoots),
    "/workspace/hermest-board/tmp/run-1"
  );
  assert.throws(
    () => assertAllowedOutputDirectory("/etc", allowedRoots),
    /outside allowed render roots/
  );
  assert.throws(
    () => assertAllowedOutputDirectory("/tmp-other/run", allowedRoots),
    /outside allowed render roots/
  );
  assert.equal(
    assertAllowedOutputDirectory("/tmp", allowedRoots),
    "/tmp"
  );
});

test("render refuses to overwrite a non-empty output directory", async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "hermest-board-boundary-"));
  await assert.doesNotReject(() => assertEmptyOutputDirectory(outputDir));
  await writeFile(path.join(outputDir, "existing.txt"), "keep", "utf8");
  await assert.rejects(() => assertEmptyOutputDirectory(outputDir), /must be empty/);
});
