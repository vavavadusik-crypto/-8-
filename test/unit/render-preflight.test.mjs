import assert from "node:assert/strict";
import { access, mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  preflightBoardInput,
  renderProject
} from "../../src/media/render-project.js";

const validFixture = path.resolve("test/fixtures/minimal-board.json");

test("invalid board input fails before any output directory is created", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "hermest-board-preflight-"));
  const invalidInput = path.join(sandbox, "invalid.json");
  const missingOutput = path.join(sandbox, "must-not-exist");
  await writeFile(invalidInput, "{invalid", { mode: 0o600 });

  await assert.rejects(
    () => renderProject({ inputPath: invalidInput, outputDir: missingOutput }),
    /valid JSON/
  );
  await assert.rejects(() => access(missingOutput));
});

test("board input preflight enforces a bounded regular file", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "hermest-board-preflight-size-"));
  const oversized = path.join(sandbox, "oversized.json");
  await writeFile(oversized, " ".repeat(2 * 1024 * 1024 + 1), { mode: 0o600 });

  await assert.rejects(() => preflightBoardInput(oversized), /input file.*limit/i);
  await assert.rejects(() => preflightBoardInput(sandbox), /regular file/i);
});

test("render output realpath cannot escape through a symlink", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "hermest-board-preflight-link-"));
  const escaped = path.join(sandbox, "escaped");
  await symlink("/etc", escaped);

  await assert.rejects(
    () => renderProject({ inputPath: validFixture, outputDir: escaped }),
    /outside allowed render roots/
  );
});
