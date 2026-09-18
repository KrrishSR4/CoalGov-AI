#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../backend"
test -f .env || cp .env.example .env
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m app.migrate
cd ../web
test -f .env || cp .env.example .env
npm ci
echo 'Ready: start the backend and web app using README.md.'
