const MAX_RESULTS_PER_SOURCE = 4;

export default async function handler(request, response) {
  const query = String(request.query?.q || "").trim();

  if (!query) {
    response.status(400).json({ ok: false, error: "missing_query" });
    return;
  }

  const tasks = [
    searchWikipedia(query),
    searchCrossref(query),
    searchArxiv(query),
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
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url.hostname}:${response.status}`);
  return response.json();
}

async function getText(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${url.hostname}:${response.status}`);
  return response.text();
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

function userAgent() {
  return `HermestBoard/0.1 (${process.env.SUPPORT_EMAIL || "no-contact-configured"})`;
}
