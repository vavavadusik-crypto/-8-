#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRET_ENV_VARS = [
  "HERMEST_FAL_API_KEY",
  "HERMEST_ELEVENLABS_API_KEY",
  "HERMEST_PEXELS_API_KEY",
  "HERMEST_SESSION_SECRET",
  "HERMEST_OAUTH_STATE_SECRET",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "GITHUB_TOKEN",
  "OPENALEX_API_KEY"
];

const DIST_DIR = "dist";

function scanDirectory(dir, violations = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      scanDirectory(fullPath, violations);
      continue;
    }

    if (!entry.endsWith(".js") && !entry.endsWith(".html")) continue;

    const content = readFileSync(fullPath, "utf8");

    for (const envVar of SECRET_ENV_VARS) {
      // Check for define-inlined or import.meta.env references
      const patterns = [
        new RegExp(`"${envVar}"\\s*:\\s*"[^"]+"`, "g"),
        new RegExp(`import\\.meta\\.env\\.${envVar}`, "g"),
        new RegExp(`process\\.env\\.${envVar}`, "g")
      ];

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          violations.push({
            file: fullPath,
            envVar,
            issue: "Secret environment variable found in bundle"
          });
        }
      }
    }
  }

  return violations;
}

const violations = scanDirectory(DIST_DIR);

if (violations.length > 0) {
  console.error("❌ Bundle leak check FAILED:");
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.envVar} — ${v.issue}`);
  }
  process.exit(1);
}

console.log("✅ Bundle leak check passed: no secret env vars in dist/");
