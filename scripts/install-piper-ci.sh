#!/usr/bin/env bash
# Устанавливает piper (TTS) + голосовые модели для CI-раннера так, чтобы
# окружение совпадало с локальным: бинарник в ~/.local/opt/piper/piper,
# модели в ~/.local/share/piper/voices/<voice>.onnx (+ .onnx.json).
# ffmpeg/ffprobe/google-chrome на ubuntu-раннерах уже предустановлены.
set -euo pipefail

PIPER_VERSION="2023.11.14-2"
PIPER_TARBALL="piper_linux_x86_64.tar.gz"
PIPER_URL="https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/${PIPER_TARBALL}"
OPT_DIR="${HOME}/.local/opt"
VOICES_DIR="${HOME}/.local/share/piper/voices"
HF_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main"

# Только те голоса, что реально гоняют реальный рендер в test:media.
# (остальные голоса из каталога покрыты unit-тестами через моки.)
declare -A VOICES=(
  ["en_US-lessac-medium"]="en/en_US/lessac/medium"
  ["ru_RU-dmitri-medium"]="ru/ru_RU/dmitri/medium"
)

mkdir -p "${OPT_DIR}" "${VOICES_DIR}"

if [ ! -x "${OPT_DIR}/piper/piper" ]; then
  echo "==> downloading piper ${PIPER_VERSION}"
  curl -fsSL "${PIPER_URL}" -o "/tmp/${PIPER_TARBALL}"
  tar -xzf "/tmp/${PIPER_TARBALL}" -C "${OPT_DIR}"
  rm -f "/tmp/${PIPER_TARBALL}"
fi
"${OPT_DIR}/piper/piper" --help >/dev/null 2>&1 || { echo "piper binary broken"; exit 1; }
echo "==> piper binary ready: ${OPT_DIR}/piper/piper"

for voice in "${!VOICES[@]}"; do
  subpath="${VOICES[$voice]}"
  onnx="${VOICES_DIR}/${voice}.onnx"
  cfg="${VOICES_DIR}/${voice}.onnx.json"
  if [ ! -s "${onnx}" ]; then
    echo "==> downloading voice ${voice}"
    curl -fsSL "${HF_BASE}/${subpath}/${voice}.onnx" -o "${onnx}"
    curl -fsSL "${HF_BASE}/${subpath}/${voice}.onnx.json" -o "${cfg}"
  fi
  # sanity: onnx должен быть непустым бинарём
  [ -s "${onnx}" ] && [ -s "${cfg}" ] || { echo "voice ${voice} download failed"; exit 1; }
  echo "==> voice ready: ${voice} ($(du -h "${onnx}" | cut -f1))"
done

echo "==> piper CI setup complete"
