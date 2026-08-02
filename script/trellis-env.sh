#!/usr/bin/env bash
# Resolve Trellis CLI + lane env for studio just recipes (run, watch).
# Prefers TRELLIS_BIN, then desk kernel sibling, then PATH.

trellis_resolve() {
  if [[ -n "${TRELLIS_BIN:-}" ]]; then
    TRELLIS_CMD="$TRELLIS_BIN"
    return
  fi

  local bun root physical cand
  bun="$(command -v bun || true)"
  root="$(pwd)"
  physical="$(pwd -P)"

  for cand in \
    "${root}/../kernel/bin/trellis.mjs" \
    "${physical}/../../../TRELLIS/kernel/bin/trellis.mjs" \
    "${physical}/../../TRELLIS/kernel/bin/trellis.mjs"; do
    if [[ -f "$cand" && -n "$bun" ]]; then
      TRELLIS_CMD="$bun $cand"
      return
    fi
  done

  if command -v trellis >/dev/null 2>&1; then
    TRELLIS_CMD="trellis"
    return
  fi

  echo "✗ trellis CLI not found (set TRELLIS_BIN or clone TRELLIS/kernel)"
  exit 1
}

trellis_lane_env() {
  if [[ -n "${TRELLIS_LANE_ID:-}" ]]; then
    export TRELLIS_LANE_ID
    return
  fi

  local state=".trellis/state.json"
  if [[ ! -f "$state" ]]; then
    return
  fi

  local lane
  lane="$(node -e "
    const fs = require('fs');
    try {
      const id = JSON.parse(fs.readFileSync('$state', 'utf8')).activeLaneId;
      if (id) process.stdout.write(String(id));
    } catch {}
  " 2>/dev/null || true)"

  if [[ -n "$lane" ]]; then
    export TRELLIS_LANE_ID="$lane"
  fi
}
