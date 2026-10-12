#!/bin/bash
# Persona backend — Oracle Cloud VM setup (Ubuntu 24.04, Ampere ARM).
# Run once on a fresh VM:  curl -fsSL <this file> | bash   (or copy + bash)
set -e

echo "--- Node.js 24 ---"
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git

echo "--- Code ---"
if [ ! -d "$HOME/persona-backend" ]; then
  echo "Copy your persona-backend folder to $HOME/persona-backend first (scp/rsync), then re-run."
  echo "Example from your machine:  scp -r ~/workspace/persona-backend ubuntu/<VM-IP>:~/"
  exit 1
fi
cd "$HOME/persona-backend"
npm install --omit=dev --no-audit --no-fund

echo "--- .env ---"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "EDIT .env NOW with your Supabase/Firebase keys, then re-run this script."
  exit 1
fi

echo "--- systemd service ---"
sudo cp deploy/persona.service /etc/systemd/system/persona.service
sudo systemctl daemon-reload
sudo systemctl enable --now persona
sleep 3
sudo systemctl status persona --no-pager | head -12
echo "--- health ---"
curl -s http://localhost:3001/health; echo
echo "Done. Open port 3001 in the OCI security list (or put nginx/Cloudflare in front)."
