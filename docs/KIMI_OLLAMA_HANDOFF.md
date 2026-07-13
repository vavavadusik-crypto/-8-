# Kimi K2.7 Code via Ollama — continuation handoff

Updated: 2026-07-13

## Recommended stack

Use:

```text
Sol/Hermes = authoritative orchestrator and final verifier
Ollama Cloud = Kimi K2.7 Code runtime
OpenCode = isolated coding-agent shell
```

Do not use the excluded local OmniCoder model.

Kimi K2.7 Code is a frontier-scale model. This machine has about 14 GiB RAM and no NVIDIA GPU, so the exact model cannot run from local weights here. The supported Ollama route is `kimi-k2.7-code:cloud` with a 256K context window.

## One-time sign-in

Ollama is installed, but cloud access requires the owner to complete browser sign-in once:

```bash
ollama serve
ollama signin
```

If `ollama serve` is already running, only run `ollama signin`.

Never paste the one-time connect URL, key, account token or API key into a project file, Board JSON, issue, commit or agent prompt.

## One-command coding launch

From the repository:

```bash
cd /home/architect/ai-dev-station/workspace/hermest-board
./scripts/start-kimi-code.sh
```

Direct equivalent:

```bash
ollama launch opencode --model kimi-k2.7-code:cloud
```

The launcher starts the local Ollama service when needed and opens OpenCode in the repository. Ollama's `--yes` only accepts integration configuration; it does not grant OpenCode permission to push, deploy, publish or bypass repository safety rules.

## First prompt for Kimi

Paste this as the first task:

```text
You are a coding worker for Hermest Board. Read AGENTS.md first, then docs/NEXT_AGENT_HANDOFF.md, docs/PRODUCT_NORTH_STAR.md, docs/DELIVERY_MASTER_PLAN.md, docs/RELEASE_READINESS.md and docs/AGENT_ORCHESTRATION.md. Sol/Hermes is the authoritative orchestrator. Do not use OmniCoder. Do not access or print secrets. Do not push, deploy, publish, alter OAuth accounts, or perform external writes. Work only on the exact active task in NEXT_AGENT_HANDOFF. Use RED→GREEN tests, preserve truthful readiness claims, run the narrow test first and npm run check before claiming completion. Return changed paths, commands actually run, results, risks and the exact commit SHA. If context or authorization is missing, stop and report the blocker instead of guessing.
```

## Optional Hermes shell

Ollama also supports:

```bash
ollama launch hermes --model kimi-k2.7-code:cloud
```

Use that only as a fallback/general agent surface. For repository implementation, OpenCode is preferred because it has the narrower coding workflow and avoids modifying the active `sol` profile configuration.

## Recovery commands

```bash
ollama list
curl -fsS http://127.0.0.1:11434/api/version
opencode --version
git status --short --branch
npm run check
```

If cloud execution says sign-in is required, rerun `ollama signin`. If a coding process is interrupted, inspect `git status` and every touched file before continuing; never assume an interrupted write was atomic.
