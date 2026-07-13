#!/usr/bin/env bash
set -euo pipefail

MODEL="${KIMI_OLLAMA_MODEL:-kimi-k2.7-code:cloud}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/hermest-board"
OLLAMA_LOG="$STATE_DIR/ollama.log"

command -v ollama >/dev/null 2>&1 || {
  echo "Ollama is not installed or is not on PATH." >&2
  exit 1
}
command -v opencode >/dev/null 2>&1 || {
  echo "OpenCode is not installed or is not on PATH." >&2
  exit 1
}

if ! curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  mkdir -p "$STATE_DIR"
  ollama serve >>"$OLLAMA_LOG" 2>&1 &
  for _ in $(seq 1 40); do
    curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

if ! curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  echo "Ollama did not become ready. Inspect: $OLLAMA_LOG" >&2
  exit 1
fi

cd "$REPO_ROOT"
printf 'Starting OpenCode with %s in %s\n' "$MODEL" "$REPO_ROOT"
printf 'If Ollama reports that sign-in is required, run: ollama signin\n'
exec ollama launch opencode --model "$MODEL" --yes -- "$@"
