import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";

const chrome = process.env.CHROME_BIN || "google-chrome";
const distIndex = resolve("dist/index.html");
const sourceIndex = resolve("index.html");
const target = existsSync(distIndex) ? distIndex : sourceIndex;
const screenshot = resolve("tmp/smoke-render.png");
const profile = resolve("tmp/chrome-smoke-profile");

mkdirSync("tmp", { recursive: true });
rmSync(profile, { recursive: true, force: true });

execFileSync(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--user-data-dir=${profile}`,
  "--window-size=1440,900",
  `--screenshot=${screenshot}`,
  `file://${target}`
], { stdio: "inherit" });

const size = statSync(screenshot).size;
if (size < 100000) {
  throw new Error(`Smoke screenshot looks too small: ${size} bytes`);
}

console.log(`smoke: ok ${screenshot} ${size} bytes`);
