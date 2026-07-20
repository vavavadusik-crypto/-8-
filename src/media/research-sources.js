import { readBoundedBytes, readBoundedJson } from "./bounded-body.js";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_PER_SOURCE_LIMIT = 3;
const MAX_QUERY_CHARS = 200;
const MAX_TOTAL_SOURCES = 12;
const MAX_PER_SOURCE_LIMIT = MAX_TOTAL_SOURCES;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_SNIPPET_CHARS = 280;

// Порядок фиксирован: от него зависят детерминированные id вида "src-<source>-<номер>".
const SOURCE_SEARCHERS = [
  { source: "wikipedia", search: searchWikipediaSource },
  { source: "crossref", search: searchCrossrefSource },
  { source: "arxiv", search: searchArxivSource },
  { source: "openlibrary", search: searchOpenLibrarySource }
];

export async function searchResearchSources(query, options = {}) {
  const normalizedQuery = normalizeQuery(query);
  const context = normalizeSearchOptions(options);

  const settled = await Promise.allSettled(
    SOURCE_SEARCHERS.map(definition => definition.search(normalizedQuery, context))
  );

  // Fail-open: упавший источник превращается в warning, остальные продолжают работать.
  const warnings = [];
  const collected = [];
  settled.forEach((item, index) => {
    const { source } = SOURCE_SEARCHERS[index];
    if (item.status === "fulfilled") collected.push(...item.value);
    else warnings.push(`${source}: ${String(item.reason?.message || item.reason || "unknown_error")}`);
  });

  const seenUrls = new Set();
  const perSourceCounters = new Map();
  const sources = [];
  for (const entry of collected) {
    if (sources.length >= MAX_TOTAL_SOURCES) break;
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const url = typeof entry.url === "string" ? entry.url.trim() : "";
    if (!title || !url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    const nextNumber = (perSourceCounters.get(entry.source) || 0) + 1;
    perSourceCounters.set(entry.source, nextNumber);
    const card = {
      id: `src-${entry.source}-${nextNumber}`,
      source: entry.source,
      title,
      url,
      snippet: typeof entry.snippet === "string" ? entry.snippet.slice(0, MAX_SNIPPET_CHARS) : ""
    };
    if (Number.isFinite(entry.year)) card.year = entry.year;
    sources.push(card);
  }

  return { sources, warnings };
}

export async function searchWikipediaSource(query, options = {}) {
  const normalizedQuery = normalizeQuery(query);
  const context = normalizeSearchOptions(options);
  const url = new URL("https://en.wikipedia.org/w/rest.php/v1/search/page");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("limit", String(context.perSourceLimit));
  const data = await getBoundedJson(url, context, { "Api-User-Agent": researchUserAgent() });
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  return pages.slice(0, context.perSourceLimit).map(page => ({
    source: "wikipedia",
    title: page?.title,
    snippet: page?.description || page?.excerpt || "",
    url: page?.key ? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}` : undefined
  }));
}

export async function searchCrossrefSource(query, options = {}) {
  const normalizedQuery = normalizeQuery(query);
  const context = normalizeSearchOptions(options);
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query", normalizedQuery);
  url.searchParams.set("rows", String(context.perSourceLimit));
  if (process.env.SUPPORT_EMAIL) url.searchParams.set("mailto", process.env.SUPPORT_EMAIL);
  const data = await getBoundedJson(url, context);
  const items = Array.isArray(data?.message?.items) ? data.message.items : [];
  return items.slice(0, context.perSourceLimit).map(item => {
    const rawYear = item?.published?.["date-parts"]?.[0]?.[0];
    const year = Number(rawYear);
    return {
      source: "crossref",
      title: firstValue(item?.title),
      snippet: [firstValue(item?.["container-title"]), rawYear].filter(Boolean).join(" · "),
      url: item?.URL || (item?.DOI ? `https://doi.org/${item.DOI}` : undefined),
      doi: item?.DOI,
      year: Number.isFinite(year) ? year : undefined
    };
  });
}

export async function searchArxivSource(query, options = {}) {
  const normalizedQuery = normalizeQuery(query);
  const context = normalizeSearchOptions(options);
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", `all:${normalizedQuery}`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(context.perSourceLimit));
  const xml = await getBoundedText(url, context);
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(match => match[1]);
  return entries.slice(0, context.perSourceLimit).map(entry => {
    const published = xmlTag(entry, "published");
    const year = Number(published.slice(0, 4));
    return {
      source: "arxiv",
      title: cleanXmlText(xmlTag(entry, "title")),
      snippet: cleanXmlText(xmlTag(entry, "summary")).slice(0, MAX_SNIPPET_CHARS),
      url: xmlTag(entry, "id"),
      published,
      year: Number.isFinite(year) && year > 0 ? year : undefined
    };
  });
}

export async function searchOpenLibrarySource(query, options = {}) {
  const normalizedQuery = normalizeQuery(query);
  const context = normalizeSearchOptions(options);
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("limit", String(context.perSourceLimit));
  const data = await getBoundedJson(url, context, { "User-Agent": researchUserAgent() });
  const docs = Array.isArray(data?.docs) ? data.docs : [];
  return docs.slice(0, context.perSourceLimit).map(item => {
    const year = Number(item?.first_publish_year);
    return {
      source: "openlibrary",
      title: item?.title,
      snippet: [firstValue(item?.author_name), item?.first_publish_year].filter(Boolean).join(" · "),
      url: item?.key ? `https://openlibrary.org${item.key}` : undefined,
      coverUrl: item?.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg` : undefined,
      year: Number.isFinite(year) ? year : undefined
    };
  });
}

function normalizeQuery(query) {
  if (typeof query !== "string" || query.trim() === "") {
    throw new TypeError("query must be a non-empty string");
  }
  return query.trim().slice(0, MAX_QUERY_CHARS);
}

function normalizeSearchOptions({
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  perSourceLimit = DEFAULT_PER_SOURCE_LIMIT
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const timeout = Number(timeoutMs);
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new RangeError("timeoutMs must be a positive number");
  }
  const limit = Number(perSourceLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PER_SOURCE_LIMIT) {
    throw new RangeError(`perSourceLimit must be an integer within 1..${MAX_PER_SOURCE_LIMIT}`);
  }
  return { fetchImpl, timeoutMs: timeout, perSourceLimit: limit };
}

async function getBoundedJson(url, context, headers = {}) {
  const response = await fetchWithTimeout(url, context, headers);
  if (!response.ok) throw new Error(`${url.hostname}:${response.status}`);
  return readBoundedJson(response, MAX_RESPONSE_BYTES, `${url.hostname} response`);
}

async function getBoundedText(url, context, headers = {}) {
  const response = await fetchWithTimeout(url, context, headers);
  if (!response.ok) throw new Error(`${url.hostname}:${response.status}`);
  const bytes = await readBoundedBytes(response, MAX_RESPONSE_BYTES, `${url.hostname} response`);
  return bytes.toString("utf8");
}

async function fetchWithTimeout(url, context, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), context.timeoutMs);
  try {
    return await context.fetchImpl(url.href, { headers, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${url.hostname}:timeout`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function xmlTag(xml, name) {
  return xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`))?.[1] || "";
}

function cleanXmlText(value) {
  return String(value).replace(/<!\[CDATA\[|\]\]>/g, "").replace(/\s+/g, " ").trim();
}

function researchUserAgent() {
  return `HermestBoard/0.1 (${process.env.SUPPORT_EMAIL || "no-contact-configured"})`;
}
