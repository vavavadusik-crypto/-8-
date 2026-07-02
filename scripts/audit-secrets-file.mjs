import { readFileSync } from "node:fs";

const file = process.argv[2];

if (!file) {
  console.error("Usage: node scripts/audit-secrets-file.mjs <path-to-md-or-env-file>");
  process.exit(1);
}

const text = readFileSync(file, "utf8");
const wanted = [
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "GITHUB_REPO_URL",
  "GITHUB_PAT",
  "OPENAI_API_KEY",
  "DATABASE_URL",
  "BLOB_READ_WRITE_TOKEN",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "TIKTOK_CLIENT_ID",
  "TIKTOK_CLIENT_SECRET",
  "META_APP_ID",
  "META_APP_SECRET",
  "OPENALEX_API_KEY",
  "SUPPORT_EMAIL"
];

const values = parseAssignments(text);
for (const key of wanted) {
  const value = values[key] || "";
  console.log(`${key}=${value ? `<set length=${value.length}>` : "<missing>"}`);
}

function parseAssignments(input) {
  const values = {};
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (!value) {
      if (!(key in values)) values[key] = "";
      continue;
    }
    const secretLike = value.match(/(vcp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+|sk-proj-[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]+)/);
    if (secretLike) value = secretLike[1];
    else value = value.split(/\s+/)[0];
    if (!values[key]) values[key] = value;
  }
  return values;
}
