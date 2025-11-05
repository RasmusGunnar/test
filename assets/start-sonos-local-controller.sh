#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"
if [ ! -d node_modules ]; then
  echo "Installerer Node-afhængigheder..."
  npm install
fi
export NODE_ENV=production
node sonos-local-server.js
