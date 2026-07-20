import assert from "node:assert/strict";
import test from "node:test";

import { searchResearchSources } from "../../src/media/research-sources.js";

const WIKIPEDIA_HOST = "en.wikipedia.org";
const CROSSREF_HOST = "api.crossref.org";
const ARXIV_HOST = "export.arxiv.org";
const OPENLIBRARY_HOST = "openlibrary.org";

function jsonResponse(payload, { status = 200 } = {}) {
  return textResponse(JSON.stringify(payload), { status });
}

function textResponse(text, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer
  };
}

function createFetchMock(handlersByHost) {
  const calls = [];
  const fetchImpl = async requestUrl => {
    const target = new URL(String(requestUrl));
    calls.push(target);
    const handler = handlersByHost[target.hostname];
    if (!handler) throw new Error(`unexpected host: ${target.hostname}`);
    return handler(target);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function happyHandlers() {
  return {
    [WIKIPEDIA_HOST]: () => jsonResponse({
      pages: [
        { title: "Quantum computing", key: "Quantum_computing", description: "Computation with qubits" }
      ]
    }),
    [CROSSREF_HOST]: () => jsonResponse({
      message: {
        items: [
          {
            title: ["Quantum supremacy"],
            URL: "https://doi.org/10.1000/quantum",
            DOI: "10.1000/quantum",
            "container-title": ["Nature"],
            published: { "date-parts": [[2019]] }
          },
          { title: ["Quantum supremacy duplicate"], URL: "https://doi.org/10.1000/quantum" }
        ]
      }
    }),
    [ARXIV_HOST]: () => textResponse(
      "<feed><entry>" +
      "<id>https://arxiv.org/abs/2001.01234</id>" +
      "<title>Quantum error correction</title>" +
      "<summary>We study surface codes.</summary>" +
      "<published>2020-01-15T00:00:00Z</published>" +
      "</entry></feed>"
    ),
    [OPENLIBRARY_HOST]: () => jsonResponse({
      docs: [
        {
          title: "Quantum Computation and Quantum Information",
          key: "/works/OL123W",
          author_name: ["Nielsen", "Chuang"],
          first_publish_year: 2000
        }
      ]
    })
  };
}

test("happy-path: все источники отвечают — нормализованный список с id и dedupe", async () => {
  const fetchImpl = createFetchMock(happyHandlers());
  const result = await searchResearchSources("quantum computing", { fetchImpl });

  assert.deepEqual(result.warnings, []);
  assert.deepEqual(
    result.sources.map(source => source.id),
    ["src-wikipedia-1", "src-crossref-1", "src-arxiv-1", "src-openlibrary-1"]
  );
  // Дубликат crossref по тому же url отброшен.
  assert.equal(result.sources.filter(source => source.source === "crossref").length, 1);

  assert.deepEqual(result.sources[0], {
    id: "src-wikipedia-1",
    source: "wikipedia",
    title: "Quantum computing",
    url: "https://en.wikipedia.org/wiki/Quantum_computing",
    snippet: "Computation with qubits"
  });
  assert.deepEqual(result.sources[1], {
    id: "src-crossref-1",
    source: "crossref",
    title: "Quantum supremacy",
    url: "https://doi.org/10.1000/quantum",
    snippet: "Nature · 2019",
    year: 2019
  });
  assert.deepEqual(result.sources[2], {
    id: "src-arxiv-1",
    source: "arxiv",
    title: "Quantum error correction",
    url: "https://arxiv.org/abs/2001.01234",
    snippet: "We study surface codes.",
    year: 2020
  });
  assert.deepEqual(result.sources[3], {
    id: "src-openlibrary-1",
    source: "openlibrary",
    title: "Quantum Computation and Quantum Information",
    url: "https://openlibrary.org/works/OL123W",
    snippet: "Nielsen · 2000",
    year: 2000
  });
});

test("один источник отвечает 500 — warning есть, остальные на месте", async () => {
  const handlers = happyHandlers();
  handlers[CROSSREF_HOST] = () => jsonResponse({}, { status: 500 });
  const fetchImpl = createFetchMock(handlers);

  const result = await searchResearchSources("quantum computing", { fetchImpl });

  assert.deepEqual(result.sources.map(source => source.source), ["wikipedia", "arxiv", "openlibrary"]);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /^crossref: api\.crossref\.org:500$/);
});

test("вся сеть падает — пустой список и warnings без исключения", async () => {
  const fetchImpl = async () => {
    throw new Error("network down");
  };

  const result = await searchResearchSources("quantum computing", { fetchImpl });

  assert.deepEqual(result.sources, []);
  assert.equal(result.warnings.length, 4);
  for (const warning of result.warnings) assert.match(warning, /network down/);
});

test("пустой или нестроковый query — TypeError", async () => {
  const fetchImpl = createFetchMock(happyHandlers());

  await assert.rejects(() => searchResearchSources("", { fetchImpl }), TypeError);
  await assert.rejects(() => searchResearchSources("   ", { fetchImpl }), TypeError);
  await assert.rejects(() => searchResearchSources(42, { fetchImpl }), TypeError);
  assert.equal(fetchImpl.calls.length, 0);
});

test("perSourceLimit режет выдачу источника, итог ограничен 12 записями", async () => {
  const manyWikipediaPages = Array.from({ length: 5 }, (_, index) => ({
    title: `Page ${index + 1}`,
    key: `Page_${index + 1}`,
    description: `Description ${index + 1}`
  }));
  const manyCrossrefItems = Array.from({ length: 5 }, (_, index) => ({
    title: [`Paper ${index + 1}`],
    URL: `https://doi.org/10.1000/paper-${index + 1}`
  }));
  const manyArxivEntries = Array.from({ length: 5 }, (_, index) =>
    `<entry><id>https://arxiv.org/abs/000${index + 1}</id><title>Preprint ${index + 1}</title>` +
    "<summary>Text.</summary><published>2021-01-01T00:00:00Z</published></entry>"
  ).join("");
  const manyOpenLibraryDocs = Array.from({ length: 5 }, (_, index) => ({
    title: `Book ${index + 1}`,
    key: `/works/OL${index + 1}W`
  }));

  const fetchImpl = createFetchMock({
    [WIKIPEDIA_HOST]: () => jsonResponse({ pages: manyWikipediaPages }),
    [CROSSREF_HOST]: () => jsonResponse({ message: { items: manyCrossrefItems } }),
    [ARXIV_HOST]: () => textResponse(`<feed>${manyArxivEntries}</feed>`),
    [OPENLIBRARY_HOST]: () => jsonResponse({ docs: manyOpenLibraryDocs })
  });

  const result = await searchResearchSources("quantum computing", { fetchImpl });

  assert.deepEqual(result.warnings, []);
  assert.equal(result.sources.length, 12);
  for (const sourceName of ["wikipedia", "crossref", "arxiv", "openlibrary"]) {
    assert.equal(result.sources.filter(source => source.source === sourceName).length, 3);
  }
  assert.equal(result.sources.at(-1).id, "src-openlibrary-3");
});

test("query обрезается до 200 символов и корректно кодируется в URL", async () => {
  const fetchImpl = createFetchMock(happyHandlers());
  const longQuery = `quantum computing & "entanglement" ${"x".repeat(300)}`;

  await searchResearchSources(longQuery, { fetchImpl });

  const wikipediaCall = fetchImpl.calls.find(call => call.hostname === WIKIPEDIA_HOST);
  assert.ok(wikipediaCall);
  const sentQuery = wikipediaCall.searchParams.get("q");
  assert.equal(sentQuery.length, 200);
  assert.equal(sentQuery, longQuery.trim().slice(0, 200));
});
