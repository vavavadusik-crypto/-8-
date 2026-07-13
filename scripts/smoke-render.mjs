import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const chrome = process.env.CHROME_BIN || "google-chrome";
const root = resolve("dist");
const distIndex = resolve(root, "index.html");
const screenshot = resolve("tmp/smoke-render.png");
const profile = resolve("tmp/chrome-smoke-profile");

if (!existsSync(distIndex)) {
  throw new Error("dist/index.html is missing; run npm run build before render smoke");
}

mkdirSync("tmp", { recursive: true });
rmSync(profile, { recursive: true, force: true });

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    let target = resolve(root, relative);

    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    try {
      const info = await stat(target);
      if (info.isDirectory()) target = resolve(target, "index.html");
    } catch (_) {
      target = distIndex;
    }

    const body = await readFile(target);
    response.writeHead(200, {
      "Content-Type": contentType(target),
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500).end(String(error?.message || error));
  }
});

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});

const address = server.address();
if (!address || typeof address === "string") {
  await closeServer(server);
  throw new Error("Could not determine render smoke server address");
}

const targetUrl = `http://127.0.0.1:${address.port}/`;
const commonArgs = [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--user-data-dir=${profile}`,
  "--window-size=1440,900",
  "--virtual-time-budget=2500"
];

try {
  const dom = await runChrome([...commonArgs, "--dump-dom", targetUrl], true);
  if (!dom.includes("article class=\"card")) {
    throw new Error("Render smoke did not produce article.card nodes");
  }

  await runChrome([...commonArgs, `--screenshot=${screenshot}`, targetUrl], false);

  const size = statSync(screenshot).size;
  if (size < 100000) {
    throw new Error(`Smoke screenshot looks too small: ${size} bytes`);
  }

  console.log(`smoke: ok ${targetUrl} ${screenshot} ${size} bytes`);
} finally {
  await closeServer(server);
  rmSync(profile, { recursive: true, force: true });
}

function runChrome(args, captureStdout) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(chrome, args, {
      stdio: ["ignore", captureStdout ? "pipe" : "inherit", "inherit"]
    });
    let stdout = "";
    if (captureStdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        stdout += chunk;
      });
    }
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`Chrome failed: code=${code} signal=${signal || "none"}`));
    });
  });
}

function closeServer(instance) {
  return new Promise(resolveClose => instance.close(() => resolveClose()));
}

function contentType(path) {
  switch (extname(path).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".webmanifest": return "application/manifest+json";
    case ".png": return "image/png";
    default: return "application/octet-stream";
  }
}
