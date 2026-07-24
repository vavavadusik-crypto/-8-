import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

describe("bundle security — no secrets in dist", () => {
  it("client bundle must not contain secret env vars", async () => {
    // После `npm run build`, dist/ содержит минифицированные JS-файлы.
    // Этот тест проверяет, что НИ ОДИН из файлов не содержит известные паттерны секретов.
    const distFiles = await findJsFiles("dist");

    if (distFiles.length === 0) {
      throw new Error("dist/ is empty — run `npm run build` first");
    }

    const SECRET_PATTERNS = [
      /sk-proj-[a-zA-Z0-9_-]+/,           // OpenAI project key
      /sk-[a-zA-Z0-9_-]{20,}/,            // OpenAI legacy key
      /Bearer\s+[a-zA-Z0-9_.-]{20,}/i,    // Bearer token (длинный токен)
      /fal_key_[a-zA-Z0-9_-]+/,           // FAL key
      /PEXELS_API_KEY["':=]\s*["'][a-zA-Z0-9_-]{20,}["']/i, // Env var с реальным значением
      /ELEVENLABS_API_KEY["':=]\s*["'][a-zA-Z0-9_-]{20,}["']/i,
      /FAL_KEY["':=]\s*["'][a-zA-Z0-9_-]{20,}["']/i
    ];

    for (const filePath of distFiles) {
      const content = await readFile(filePath, "utf8");

      for (const pattern of SECRET_PATTERNS) {
        const match = content.match(pattern);
        if (match) {
          assert.fail(
            `Bundle leak detected in ${filePath}: found pattern ${pattern.source}\n` +
            `Match: ${match[0].slice(0, 60)}...`
          );
        }
      }
    }

    // Если дошли сюда — ни один паттерн не найден
    assert.ok(distFiles.length > 0, "Bundle files were checked");
  });
});

async function findJsFiles(dir) {
  const results = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await findJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(fullPath);
    }
  }
  return results;
}
