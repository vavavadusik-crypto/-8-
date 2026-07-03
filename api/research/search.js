const MAX_RESULTS_PER_SOURCE = 4;

export default async function handler(request, response) {
  const query = String(request.query?.q || "").trim();

  if (!query) {
    response.status(400).json({ ok: false, error: "missing_query" });
    return;
  }

  const tasks = [
    searchWikipedia(query),
    searchWikidata(query),
    searchCommons(query),
    searchCrossref(query),
    searchArxiv(query),
    searchOpenLibrary(query),
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

async function searchWikipedia(query) {
  const url = new URL("https://en.wikipedia.org/w/rest.php/v1/search/page");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(MAX_RESULTS_PER_SOURCE));
  const data = await getJson(url, { "Api-User-Agent": userAgent() });
  return (data.pages || []).map(page => ({
    source: "wikipedia",
    title: page.title,
    summary: page.description || page.excerpt || "",
    url: page.key ? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key)}` : undefined
  }));
}

async function searchCrossref(query) {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query", query);
  url.searchParams.set("rows", String(MAX_RESULTS_PER_SOURCE));
  if (process.env.SUPPORT_EMAIL) url.searchParams.set("mailto", process.env.SUPPORT_EMAIL);
  const data = await getJson(url);
  return (data.message?.items || []).map(item => ({
    source: "crossref",
    title: first(item.title),
    summary: [first(item["container-title"]), item.published?.["date-parts"]?.[0]?.[0]].filter(Boolean).join(" · "),
    url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : undefined),
    doi: item.DOI
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

async function searchArxiv(query) {
  const url = new URL("https://export.arxiv.org/api/query");
  url.searchParams.set("search_query", `all:${query}`);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(MAX_RESULTS_PER_SOURCE));
  const text = await getText(url);
  const entries = [...text.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(match => match[1]);
  return entries.map(entry => {
    const id = tag(entry, "id");
    return {
      source: "arxiv",
      title: cleanXml(tag(entry, "title")),
      summary: cleanXml(tag(entry, "summary")).slice(0, 280),
      url: id,
      published: tag(entry, "published")
    };
  });
}

async function searchOpenLibrary(query) {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(MAX_RESULTS_PER_SOURCE));
  const data = await getJson(url, { "User-Agent": userAgent() });
  return (data.docs || []).map(item => ({
    source: "openlibrary",
    title: item.title,
    summary: [first(item.author_name), item.first_publish_year].filter(Boolean).join(" · "),
    url: item.key ? `https://openlibrary.org${item.key}` : undefined,
    coverUrl: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg` : undefined
  }));
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

async function getText(url, headers = {}) {
  const response = await fetchWithTimeout(url, { headers });
  if (!response.ok) throw new Error(`${url.hostname}:${response.status}`);
  return response.text();
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${url.hostname}:timeout`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function tag(xml, name) {
  return xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`))?.[1] || "";
}

function cleanXml(value) {
  return String(value).replace(/<!\[CDATA\[|\]\]>/g, "").replace(/\s+/g, " ").trim();
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
