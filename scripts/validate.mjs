import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
const providerCatalog = JSON.parse(readFileSync("public/api-provider-catalog.json", "utf8"));
const appEntrypoint = '<script type="module" src="/src/app.js"></script>';

if (!html.includes("<!doctype html>")) {
  throw new Error("index.html is missing a doctype");
}

if (!html.includes("Hermest Board")) {
  throw new Error("index.html is missing the product name");
}

if (!html.includes(appEntrypoint)) {
  throw new Error("index.html is missing the external module entrypoint");
}

if (!Array.isArray(providerCatalog.providers) || providerCatalog.providers.length < 20) {
  throw new Error("API provider catalog is missing provider entries");
}

if (!providerCatalog.providers.some(provider => provider.auth === "none") || !providerCatalog.providers.some(provider => provider.id === "openai")) {
  throw new Error("API provider catalog must include OpenAI and no-key public providers");
}

for (const file of findJavaScriptFiles("src")) {
  execFileSync("node", ["--check", file], { stdio: "inherit" });
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
