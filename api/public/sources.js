const SOURCES = [
  {
    id: "wikipedia",
    name: "Wikipedia / MediaWiki REST",
    keyRequired: false,
    use: "encyclopedic summaries and source links",
    docs: "https://www.mediawiki.org/wiki/API:REST_API"
  },
  {
    id: "crossref",
    name: "Crossref REST API",
    keyRequired: false,
    use: "publication metadata, DOI lookup, papers and books",
    docs: "https://www.crossref.org/documentation/retrieve-metadata/rest-api/"
  },
  {
    id: "arxiv",
    name: "arXiv API",
    keyRequired: false,
    use: "open research preprints",
    docs: "https://info.arxiv.org/help/api/index.html"
  },
  {
    id: "openalex",
    name: "OpenAlex API",
    keyRequired: true,
    keyEnv: "OPENALEX_API_KEY",
    freeKeyAvailable: true,
    configured: Boolean(process.env.OPENALEX_API_KEY),
    use: "scholarly works, authors, topics, institutions",
    docs: "https://developers.openalex.org/api-reference/introduction"
  },
  {
    id: "github-public",
    name: "GitHub public search",
    keyRequired: false,
    optionalKeyEnv: "GITHUB_TOKEN",
    use: "open-source repositories and examples",
    docs: "https://docs.github.com/rest/search/search"
  }
];

export default function handler(_request, response) {
  response.status(200).json({
    ok: true,
    sources: SOURCES
  });
}
