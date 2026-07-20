import {
  searchArxivSource,
  searchCrossrefSource,
  searchOpenLibrarySource,
  searchWikipediaSource
} from "../../src/media/research-sources.js";

const MAX_RESULTS_PER_SOURCE = 4;
const REQUEST_TIMEOUT_MS = 7000;

export default async function handler(request, response) {
  const query = String(request.query?.q || "").trim();

  if (!query) {
    response.status(400).json({ ok: false, error: "missing_query" });
    return;
  }

  const sharedSearchOptions = {
    timeoutMs: REQUEST_TIMEOUT_MS,
    perSourceLimit: MAX_RESULTS_PER_SOURCE
  };

  const tasks = [
    searchWikipedia(query, sharedSearchOptions),
    searchWikidata(query),
    searchCommons(query),
    searchCrossref(query, sharedSearchOptions),
    searchArxiv(query, sharedSearchOptions),
    searchOpenLibrary(query, sharedSearchOptions),
    searchGithub(query)
  ];

  if (process.env.OPENALEX_API_KEY) tasks.push(searchOpenAlex(query));

  const settled = await Promise.allSettled(tasks);
  const results = [];
  const errors = [];

  for (const item of settled) {
    if (item.status === "fulfilled") results.push(...item.value);
    else errors.push(String(item.reason?.message || item.reason || "unknown_error"));
  }

  response.status(200).json({
    ok: true,
    query,
    results,
    errors,
    note: "Public research only. Always verify licenses and source quality before using media or quotes."
  });
}

// Общая логика этих четырёх поисковиков живёт в src/media/research-sources.js;
// здесь только адаптация к публичному формату хендлера (summary вместо snippet,
// исторические поля doi/published/coverUrl) — формат ответа API не меняется.
async function searchWikipedia(query, options) {
  const entries = await searchWikipediaSource(query, options);
  return entries.map(entry => ({
    source: "wikipedia",
    title: entry.title,
    summary: entry.snippet,
    url: entry.url
  }));
}

async function searchCrossref(query, options) {
  const entries = await searchCrossrefSource(query, options);
  return entries.map(entry => ({
    source: "crossref",
    title: entry.title,
    summary: entry.snippet,
    url: entry.url,
    doi: entry.doi
  }));
}

async function searchArxiv(query, options) {
  const entries = await searchArxivSource(query, options);
  return entries.map(entry => ({
    source: "arxiv",
    title: entry.title,
    summary: entry.snippet,
    url: entry.url,
    published: entry.published
  }));
}

async function searchOpenLibrary(query, options) {
  const entries = await searchOpenLibrarySource(query, options);
  return entries.map(entry => ({
    source: "openlibrary",
    title: entry.title,
    summary: entry.snippet,
    url: entry.url,
    coverUrl: entry.coverUrl
  }));
}

async function searchWikidata(query) {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbsearchentities");
  url.searchParams.set("search", query);
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(MAX_RESULTS_PER_SOURCE));
  const data = await getJson(url, { "Api-User-Agent": userAgent() });
  return (data.search || []).map(item => ({
    source: "wikidata",
    title: item.label || item.id,
    summary: item.description || "",
    url: item.concepturi || (item.id ? `https://www.wikidata.org/wiki/${encodeURIComponent(item.id)}` : undefined),
    entityId: item.id
  }));
}

async function searchCommons(query) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(MAX_RESULTS_PER_SOURCE));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|extmetadata");
  url.searchParams.set("format", "json");
  const data = await getJson(url, { "Api-User-Agent": userAgent() });
  return Object.values(data.query?.pages || {}).map(page => {
    const image = page.imageinfo?.[0] || {};
    const metadata = image.extmetadata || {};
    return {
      source: "commons",
      title: String(page.title || "").replace(/^File:/, ""),
      summary: cleanHtml(metadata.ImageDescription?.value || metadata.ObjectName?.value || ""),
      url: image.descriptionurl || image.url,
      mediaUrl: image.url,
      mime: image.mime,
      license: cleanHtml(metadata.LicenseShortName?.value || metadata.UsageTerms?.value || "")
    };
  });
}

async function searchGithub(query) {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", String(MAX_RESULTS_PER_SOURCE));
  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": userAgent()
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const data = await getJson(url, headers);
  return (data.items || []).map(repo => ({
    source: "github-public",
    title: repo.full_name,
    summary: repo.description || "",
    url: repo.html_url,
    stars: repo.stargazers_count
  }));
}

async function searchOpenAlex(query) {
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(MAX_RESULTS_PER_SOURCE));
  url.searchParams.set("api_key", process.env.OPENALEX_API_KEY);
  const data = await getJson(url);
  return (data.results || []).map(work => ({
    source: "openalex",
    title: work.title,
    summary: [work.publication_year, work.type].filter(Boolean).join(" · "),
    url: work.doi || work.id,
    citedByCount: work.cited_by_count
  }));
}

async function getJson(url, headers = {}) {
  const response = await fetchWithTimeout(url, { headers });
  if (!response.ok) throw new Error(`${url.hostname}:${response.status}`);
  return response.json();
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${url.hostname}:timeout`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function cleanHtml(value) {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

function userAgent() {
  return `HermestBoard/0.1 (${process.env.SUPPORT_EMAIL || "no-contact-configured"})`;
}
