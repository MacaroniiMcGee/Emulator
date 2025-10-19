#!/usr/bin/env bash
set -euo pipefail

# auto-detect inner project dir if executed from the outer folder
if [ ! -d "backend" ]; then
  inner="$(find . -maxdepth 1 -type d ! -path . | head -n 1)"
  [ -n "${inner:-}" ] && cd "$inner"
fi

echo "[+] Installing system deps (build-essential, libgpiod-dev, gpiod)…"
sudo apt-get update -y
sudo apt-get install -y build-essential libgpiod-dev gpiod

echo "[+] Building Wiegand helper (libgpiod v2)…"
pushd backend/native >/dev/null
make
popd >/dev/null

echo "[+] Starting backend on :3001 (CTRL+C to stop)…"
sudo node backend/server.js
