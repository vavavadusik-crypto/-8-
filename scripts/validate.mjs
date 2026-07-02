import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const html = readFileSync("index.html", "utf8");
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/);

if (!html.includes("<!doctype html>")) {
  throw new Error("index.html is missing a doctype");
}

if (!html.includes("Hermest Board")) {
  throw new Error("index.html is missing the product name");
}

if (!scriptMatch) {
  throw new Error("Could not extract inline script for syntax validation");
}

const dir = mkdtempSync(join(tmpdir(), "hermest-validate-"));
const scriptPath = join(dir, "app.js");
writeFileSync(scriptPath, scriptMatch[1]);

try {
  execFileSync("node", ["--check", scriptPath], { stdio: "inherit" });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

for (const file of findJavaScriptFiles("api")) {
  execFileSync("node", ["--check", file], { stdio: "inherit" });
}

console.log("validate: ok");

function findJavaScriptFiles(root) {
  const files = [];
  try {
    for (const entry of readdirSync(root)) {
      const path = `${root}/${entry}`;
      const stat = statSync(path);
      if (stat.isDirectory()) files.push(...findJavaScriptFiles(path));
      if (stat.isFile() && path.endsWith(".js")) files.push(path);
    }
  } catch (_) {
    return files;
  }
  return files;
}
