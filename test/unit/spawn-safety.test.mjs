import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runMediaTool } from "../../src/media/process-runner.js";

describe("spawn safety — command injection guards", () => {
  it("rejects non-array args", async () => {
    await assert.rejects(
      async () => runMediaTool("ffmpeg", "-version"),
      {
        name: "TypeError",
        message: /Media tool arguments must be a string array/
      }
    );
  });

  it("rejects non-string array elements", async () => {
    await assert.rejects(
      async () => runMediaTool("ffmpeg", ["-version", 123, null]),
      {
        name: "TypeError",
        message: /Media tool arguments must be a string array/
      }
    );
  });

  it("shell injection attempt stays literal (safe array form)", async () => {
    // Тест: если бы spawn использовал shell:true или конкатенацию строк,
    // `; rm -rf /` был бы выполнен как отдельная команда.
    // С array-форматом и shell:false — это просто невалидный флаг ffmpeg.
    const maliciousArg = "-version; rm -rf /";
    await assert.rejects(
      async () => runMediaTool("ffmpeg", [maliciousArg], { timeoutMs: 3000 }),
      // ffmpeg вернёт ошибку: unrecognized option '-version; rm -rf /'
      // (команда rm НЕ выполняется)
      error => error.message.includes("exited") || error.message.includes("timeout")
    );
  });

  it("filename with semicolon stays literal", async () => {
    const filename = "file;rm-rf.txt";
    // Конструируем валидный аргумент для ffprobe (проверка существования файла).
    // Если spawn использовал shell, ";rm-rf" был бы интерпретирован как команда.
    // С array-форматом — это просто путь к несуществующему файлу.
    await assert.rejects(
      async () => runMediaTool("ffprobe", ["-v", "error", filename], { timeoutMs: 3000 }),
      // ffprobe вернёт ошибку о несуществующем файле, а НЕ выполнит команду
      error => error.message.includes("exited") || error.message.includes("No such file")
    );
  });
});
