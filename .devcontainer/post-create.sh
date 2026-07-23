#!/usr/bin/env bash
# Готовит облачное окружение Codespaces под весь конвейер Hermest Board:
# ffmpeg + Google Chrome + piper (TTS) + node-зависимости. Вся тяжёлая работа
# (рендеры, тесты) выполняется на серверах GitHub, а не на локальном ноутбуке.
set -euo pipefail

echo "==> installing ffmpeg (provides /usr/bin/ffmpeg + ffprobe)"
sudo apt-get update -qq
sudo apt-get install -y -qq ffmpeg

echo "==> ensuring Google Chrome at /usr/bin/google-chrome (scene composer)"
if ! command -v google-chrome >/dev/null 2>&1; then
  curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb
  sudo apt-get install -y -qq /tmp/chrome.deb || sudo dpkg -i /tmp/chrome.deb || sudo apt-get -f install -y
  rm -f /tmp/chrome.deb
fi
google-chrome --version || echo "chrome unavailable — renders fall back to legacy scenes"

echo "==> installing piper (TTS) + voice models"
bash scripts/install-piper-ci.sh

echo "==> installing node dependencies"
npm install

echo "==> Hermest Board Codespace ready. Run the full gate off your laptop with: npm run check"
