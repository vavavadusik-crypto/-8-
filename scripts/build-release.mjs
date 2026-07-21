#!/usr/bin/env node

// Детерминированный SHA-256 manifest готового билда dist/.
// Одинаковый dist всегда даёт одинаковый manifest: сортировка по относительному
// пути, LF-переводы строк, пути относительно dist/ (без абсолютных путей).
// Сам билд не запускает — только читает уже собранный dist/.

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");
const manifestName = "RELEASE_MANIFEST.sha256";
const manifestPath = path.join(distDir, manifestName);

main().catch(error => {
  process.stderr.write(`release:manifest failed: ${error.message}\n`);
  process.exitCode = 1;
});

async function main() {
  await assertDistExists();
  const version = await readVersion();

  const files = await collectFiles(distDir);
  const entries = [];
  for (const { absolutePath, size } of files) {
    const relativePath = toPosixRelative(absolutePath);
    // Manifest не хеширует сам себя — иначе повторный прогон был бы недетерминирован.
    if (relativePath === manifestName) continue;
    const hash = await hashFile(absolutePath);
    entries.push({ path: relativePath, hash, size });
  }
  entries.sort(byPath);

  const totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  await writeManifest(entries, totalBytes, version);
  printSummary(entries, totalBytes, version);
}

async function assertDistExists() {
  let stats;
  try {
    stats = await stat(distDir);
  } catch {
    throw new Error("dist/ not found — run `npm run build` first");
  }
  if (!stats.isDirectory()) {
    throw new Error("dist exists but is not a directory — run `npm run build` first");
  }
}

async function readVersion() {
  const raw = await readFile(path.join(projectRoot, "package.json"), "utf8");
  const version = JSON.parse(raw).version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("package.json is missing a version");
  }
  return version;
}

async function collectFiles(directory) {
  const results = [];
  const dirEntries = await readdir(directory, { withFileTypes: true });
  for (const dirEntry of dirEntries) {
    const absolutePath = path.join(directory, dirEntry.name);
    if (dirEntry.isDirectory()) {
      results.push(...await collectFiles(absolutePath));
    } else if (dirEntry.isFile()) {
      // Только регулярные файлы (fail-closed): симлинки и спец-узлы пропускаются.
      const { size } = await stat(absolutePath);
      results.push({ absolutePath, size });
    }
  }
  return results;
}

function hashFile(absolutePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(absolutePath);
    stream.on("error", reject);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function writeManifest(entries, totalBytes, version) {
  const body = entries.map(entry => `${entry.hash}  ${entry.path}`).join("\n");
  const summary = `# files: ${entries.length}, total bytes: ${totalBytes}, version: ${version}`;
  const manifest = entries.length > 0 ? `${body}\n${summary}\n` : `${summary}\n`;
  await writeFile(manifestPath, manifest, "utf8");
}

function printSummary(entries, totalBytes, version) {
  const topFiles = [...entries].sort((a, b) => b.size - a.size).slice(0, 5);
  process.stdout.write("Hermest Board release manifest\n");
  process.stdout.write(`  version:     ${version}\n`);
  process.stdout.write(`  files:       ${entries.length}\n`);
  process.stdout.write(`  total bytes: ${totalBytes} (${formatBytes(totalBytes)})\n`);
  process.stdout.write(`  manifest:    dist/${manifestName}\n`);
  if (topFiles.length > 0) {
    process.stdout.write("  top 5 largest:\n");
    for (const entry of topFiles) {
      process.stdout.write(`    ${formatBytes(entry.size).padStart(10)}  ${entry.path}\n`);
    }
  }
}

function toPosixRelative(absolutePath) {
  return path.relative(distDir, absolutePath).split(path.sep).join("/");
}

function byPath(a, b) {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return unitIndex === 0 ? `${value} ${units[unitIndex]}` : `${value.toFixed(1)} ${units[unitIndex]}`;
}
