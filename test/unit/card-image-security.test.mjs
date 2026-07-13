import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const moduleUrl = new URL("../../src/card-image.js", import.meta.url);
const indexUrl = new URL("../../index.html", import.meta.url);
const appUrl = new URL("../../src/app.js", import.meta.url);
const vercelUrl = new URL("../../vercel.json", import.meta.url);
const smokeRenderUrl = new URL("../../scripts/smoke-render.mjs", import.meta.url);
const projectsModuleUrl = new URL("../../api/_lib/projects.js", import.meta.url);

test("card image policy accepts HTTPS/raster data and rejects executable sources", async () => {
  const { normalizeCardImageUrl } = await import(moduleUrl);

  assert.equal(normalizeCardImageUrl("https://cdn.example/image.png"), "https://cdn.example/image.png");
  assert.equal(normalizeCardImageUrl("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=");
  const safeSvg = "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20fill%3D%22url(%23bg)%22%2F%3E%3C%2Fsvg%3E";
  assert.equal(normalizeCardImageUrl(safeSvg), safeSvg);
  assert.equal(normalizeCardImageUrl("javascript:alert(1)"), "");
  assert.equal(normalizeCardImageUrl("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(normalizeCardImageUrl("data:image/svg+xml,<svg onload=alert(1)></svg>"), "");
  assert.equal(normalizeCardImageUrl("http://cdn.example/image.png"), "");
});

test("card image renderer builds DOM nodes without interpreting attacker markup", async () => {
  const { renderCardImage } = await import(moduleUrl);
  const document = fakeDocument();
  const media = document.createElement("div");
  media.ownerDocument = document;

  renderCardImage(media, `https://cdn.example/image.png\" onerror=\"globalThis.xss=1`);

  assert.equal(media.children.length, 1);
  assert.equal(media.children[0].tagName, "IMG");
  assert.match(media.children[0].src, /%22%20onerror=/);
  assert.equal("onerror" in media.children[0], false);

  renderCardImage(media, "javascript:globalThis.xss=1");

  assert.equal(media.children.length, 1);
  assert.equal(media.children[0].className, "media-placeholder");
  assert.equal(media.children[0].children[1].textContent, "добавить фото");
});

test("board entrypoint delegates card image rendering to the safe DOM module", async () => {
  const [index, app] = await Promise.all([
    readFile(indexUrl, "utf8"),
    readFile(appUrl, "utf8")
  ]);

  assert.match(index, /<script type="module" src="\/src\/app\.js"><\/script>/);
  assert.match(app, /import \{ normalizeCardImageUrl, renderCardImage \} from "\.\/card-image\.js";/);
  assert.match(app, /card\.image = normalizeCardImageUrl\(card\.image\);/);
  assert.match(app, /renderCardImage\(media, card\.image\);/);
  assert.doesNotMatch(app, /media\.innerHTML\s*=\s*card\.image/);
});

test("production CSP does not allow inline script execution", async () => {
  const config = JSON.parse(await readFile(vercelUrl, "utf8"));
  const headers = config.headers.flatMap(rule => rule.headers || []);
  const csp = headers.find(header => header.key.toLowerCase() === "content-security-policy")?.value || "";
  const scriptDirective = csp.split(";").map(part => part.trim()).find(part => part.startsWith("script-src")) || "";

  assert.notEqual(scriptDirective, "");
  assert.doesNotMatch(scriptDirective, /'unsafe-inline'/);
});

test("render smoke serves ES modules over HTTP and asserts rendered cards", async () => {
  const smoke = await readFile(smokeRenderUrl, "utf8");

  assert.doesNotMatch(smoke, /file:\/\//);
  assert.match(smoke, /createServer/);
  assert.match(smoke, /http:\/\/127\.0\.0\.1:/);
  assert.match(smoke, /article\.card/);
});

test("API project normalization drops unsafe card image sources", async () => {
  const { normalizeProjectDocument } = await import(projectsModuleUrl);
  const project = normalizeProjectDocument({
    cards: [
      { id: "safe", image: "https://cdn.example/image.png" },
      { id: "script", image: "javascript:alert(1)" },
      { id: "markup", image: `https://cdn.example/x\" onerror=\"alert(1)` }
    ]
  });

  assert.equal(project.cards[0].image, "https://cdn.example/image.png");
  assert.equal(project.cards[1].image, "");
  assert.match(project.cards[2].image, /%22%20onerror=/);
});

function fakeDocument() {
  return {
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        className: "",
        textContent: "",
        children: [],
        replaceChildren(...children) {
          this.children = children;
        }
      };
    }
  };
}
