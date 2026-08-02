#!/usr/bin/env bash
# sprite-init.sh — Bootstrap script called by the control plane after cloning
# this opencode fork into a new tenant Sprite.
#
# Usage (from control plane):
#   sprite exec -s <sprite-name> bash /home/sprite/turtlecode/scripts/sprite-init.sh \
#     --tenant-id <tenant-id> \
#     --sprite-url <url>
#
# This script:
#   1. Writes tenant env vars into .env
#   2. Installs dependencies
#   3. Creates a Sprite service for the opencode backend

set -euo pipefail

TENANT_ID=""
SPRITE_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --tenant-id) TENANT_ID="$2"; shift 2 ;;
    --sprite-url) SPRITE_URL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$TENANT_ID" ]]; then
  echo "Error: --tenant-id is required"
  exit 1
fi

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_DIR/.env"

echo "" >> "$ENV_FILE"
echo "# TENANT (set by control plane)" >> "$ENV_FILE"
echo "VITE_SPRITE_TENANT_ID=\"$TENANT_ID\"" >> "$ENV_FILE"
[[ -n "$SPRITE_URL" ]] && echo "VITE_SPRITE_URL=\"$SPRITE_URL\"" >> "$ENV_FILE"
echo "TURTLECODE_REPO=\"$REPO_DIR\"" >> "$ENV_FILE"

echo "Tenant env written to $ENV_FILE"

# Install deps + build
cd "$REPO_DIR"
if command -v bun &>/dev/null; then
  bun install
  # Build the web app (SolidJS/Vite)
  bun run --cwd packages/app build
else
  echo "Warning: bun not found, skipping install"
fi

# Create sprite services so backend + web app auto-start on wake.
if command -v sprite-env &>/dev/null; then
  # Backend: turtlecode fork's opencode server (API + Trellis routes)
  sprite-env services create opencode-backend \
    --cmd bun \
    --args "run --conditions=browser --cwd $REPO_DIR/packages/opencode ./src/index.ts serve --port 4096 --host 0.0.0.0" \
    2>/dev/null || echo "Service 'opencode-backend' may already exist, skipping create"

  # Web app: Vite preview of the turtlecode frontend (Sprites route → port 8080)
  sprite-env services create opencode-web \
    --cmd bun \
    --args "run --cwd $REPO_DIR/packages/app serve -- --port 8080 --host 0.0.0.0" \
    2>/dev/null || echo "Service 'opencode-web' may already exist, skipping create"
fi

echo "Sprite init complete for tenant=$TENANT_ID"
