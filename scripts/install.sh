#!/usr/bin/env bash
# Hermest Board — bare-metal installer (Debian/Ubuntu, idempotent)
# Устанавливает ffmpeg, chromium, piper + voices, собирает приложение.
# НЕ устанавливает Node.js автоматически — проверяет только версию.
set -euo pipefail

MIN_NODE_VERSION="20.11"

echo "==> Hermest Board — self-host installer (bare-metal Debian/Ubuntu)"

# ========== 1. Detect OS ==========
if ! command -v apt-get &>/dev/null; then
  echo "ERROR: apt-get not found. This installer is for Debian/Ubuntu."
  echo "For other systems, manually install:"
  echo "  - Node.js >= ${MIN_NODE_VERSION} (https://nodejs.org/)"
  echo "  - ffmpeg + chromium (system package manager)"
  echo "  - piper via scripts/install-piper-ci.sh"
  echo "  - npm ci && npm run build"
  exit 1
fi

# ========== 2. Check Node.js version ==========
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install Node.js >= ${MIN_NODE_VERSION} first:"
  echo "  https://nodejs.org/ or https://github.com/nodesource/distributions"
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
# Semantic version comparison via `sort -V`: if the required version sorts
# before (or equal to) the installed one, the requirement is satisfied.
# (Avoids lexicographic string comparison, which wrongly rejects "22.x" vs "20.11".)
if ! printf '%s\n%s\n' "${MIN_NODE_VERSION}" "${NODE_VERSION}" | sort -V -C; then
  echo "ERROR: Node.js version ${NODE_VERSION} is below required ${MIN_NODE_VERSION}"
  echo "Install Node.js >= ${MIN_NODE_VERSION} from https://nodejs.org/"
  exit 1
fi

echo "==> Node.js ${NODE_VERSION} OK"

# ========== 3. Install ffmpeg + chromium (requires sudo) ==========
echo "==> Installing ffmpeg + chromium (requires sudo)..."
if ! command -v ffmpeg &>/dev/null || ! command -v chromium &>/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq --no-install-recommends ffmpeg chromium
else
  echo "==> ffmpeg + chromium already installed"
fi

# Проверка
command -v ffmpeg &>/dev/null || { echo "ERROR: ffmpeg not installed"; exit 1; }
command -v ffprobe &>/dev/null || { echo "ERROR: ffprobe not installed"; exit 1; }
command -v chromium &>/dev/null || { echo "ERROR: chromium not installed"; exit 1; }
echo "==> ffmpeg + chromium OK"

# ========== 4. Install piper + voices ==========
echo "==> Installing piper + voices (local ~/.local/opt/piper)..."
bash "$(dirname "$0")/install-piper-ci.sh"

# ========== 5. Install npm dependencies ==========
echo "==> Installing npm dependencies (npm ci)..."
npm ci

# ========== 6. Build application ==========
echo "==> Building application (npm run build)..."
npm run build

# ========== DONE ==========
echo ""
echo "=========================================="
echo "Hermest Board installed successfully!"
echo "=========================================="
echo ""
echo "To start the server (with media worker):"
echo "  PORT=8080 npm run preview -- --host 0.0.0.0"
echo ""
echo "Then open: http://localhost:8080"
echo ""
echo "BYOK keys (optional, .env or ENV):"
echo "  HERMEST_ELEVENLABS_API_KEY=... (ElevenLabs)"
echo "  HERMEST_FAL_API_KEY=...        (Fal.ai)"
echo "  HERMEST_PEXELS_API_KEY=...     (Pexels)"
echo ""
echo "See docs/DEPLOYMENT.md for more details."
