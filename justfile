# OpenCode Client

# Run web client dev server
client:
    cd packages/app && bun dev -- --port 4848

# Run web client with remote API
client-remote:
    cd packages/app && VITE_API_URL=https://api.opencode.ai bun dev -- --port 4848

# Run console backend only
backend:
    cd packages/opencode && bun run --hot --conditions=browser ./src/index.ts serve --port 4096

# Run Tauri desktop app (reuses sidecar; DESKTOP_REBUILD=1 to rebuild)
desktop:
    #!/usr/bin/env bash
    set -euo pipefail
    # Sidecar rebuild embeds the full web UI and can exceed Tauri's 180s vite wait,
    # so we prep the sidecar first, then start tauri with vite-only beforeDevCommand.
    cd packages/desktop
    target="${TAURI_ENV_TARGET_TRIPLE:-$(rustc -vV 2>/dev/null | awk '/^host:/ {print $2}')}"
    if [[ -z "$target" ]]; then
        echo "✗ Could not detect Rust target (is rustc installed?)"
        exit 1
    fi
    sidecar="src-tauri/sidecars/opencode-cli-${target}"
    if [[ "${DESKTOP_REBUILD:-}" == "1" || ! -x "$sidecar" ]]; then
        echo "Building opencode sidecar ($sidecar)..."
        echo "(this embeds the web UI — can take several minutes)"
        TAURI_ENV_TARGET_TRIPLE="$target" bun ./scripts/predev.ts
    else
        echo "Reusing sidecar: $sidecar"
        echo "(set DESKTOP_REBUILD=1 to rebuild)"
    fi
    echo "Freeing port 1420..."
    kill -9 $(lsof -ti :1420) 2>/dev/null || true
    echo "Starting Tauri (vite on :1420)..."
    bun tauri dev

# Trellis file watcher (lane-aware when state.json has activeLaneId)
watch:
    #!/usr/bin/env bash
    set -euo pipefail
    source "{{justfile_directory()}}/script/trellis-env.sh"
    trellis_resolve
    if [[ ! -f .trellis/config.json ]]; then
        echo "✗ No .trellis/config.json — run trellis init in this repo"
        exit 1
    fi
    trellis_lane_env
    WATCH_LOG=".trellis/_watch.log"
    mkdir -p .trellis
    echo "Starting trellis watch (logs: $WATCH_LOG)..."
    if [[ -n "${TRELLIS_LANE_ID:-}" ]]; then
        echo "  Lane: $TRELLIS_LANE_ID"
    fi
    exec ${TRELLIS_CMD} watch -p "$(pwd)"

# Run backend and client concurrently (plus trellis watch for FS-level op tracking)
run:
    #!/usr/bin/env bash
    set -euo pipefail
    source "{{justfile_directory()}}/script/trellis-env.sh"

    # Free ports + stop any stale watcher from a prior run
    echo "Freeing ports 4096 and 4848..."
    kill -9 $(lsof -ti :4096) 2>/dev/null || true
    kill -9 $(lsof -ti :4848) 2>/dev/null || true
    if [[ -f .trellis/_watch.pid ]]; then
        kill "$(cat .trellis/_watch.pid)" 2>/dev/null || true
        rm -f .trellis/_watch.pid
    fi

    WATCH_LOG=".trellis/_watch.log"
    WATCH_PID_FILE=".trellis/_watch.pid"

    cleanup() {
        echo "Shutting down..."
        kill -9 $(lsof -ti :4096) 2>/dev/null || true
        kill -9 $(lsof -ti :4848) 2>/dev/null || true
        if [[ -f "$WATCH_PID_FILE" ]]; then
            kill "$(cat "$WATCH_PID_FILE")" 2>/dev/null || true
            rm -f "$WATCH_PID_FILE"
        fi
        wait 2>/dev/null || true
    }
    trap cleanup EXIT INT TERM

    echo "Starting backend on :4096..."
    (cd packages/opencode && bun run --hot --conditions=browser ./src/index.ts serve --port 4096) &
    BACKEND_PID=$!

    echo "Starting client on :4848..."
    (cd packages/app && bun dev -- --port 4848) &
    CLIENT_PID=$!

    WATCH_PID=""
    trellis_resolve
    if [[ -f .trellis/config.json ]]; then
        trellis_lane_env
        echo "Starting trellis watch (logs: $WATCH_LOG)..."
        mkdir -p .trellis
        ( ${TRELLIS_CMD} watch -p "$(pwd)" >"$WATCH_LOG" 2>&1 ) &
        WATCH_PID=$!
        echo "$WATCH_PID" >"$WATCH_PID_FILE"
    else
        echo "(trellis watch skipped — .trellis/config.json absent)"
    fi

    echo ""
    echo "OpenCode running:"
    echo "  Backend: http://localhost:4096"
    echo "  Client:  http://localhost:4848"
    if [[ -n "$WATCH_PID" ]]; then
        echo "  Watcher: pid $WATCH_PID — tail -f $WATCH_LOG"
        if [[ -n "${TRELLIS_LANE_ID:-}" ]]; then
            echo "  Lane:    $TRELLIS_LANE_ID (ops → .trellis/lanes/$TRELLIS_LANE_ID/)"
        fi
    fi
    echo "Press Ctrl+C to stop all"
    echo ""

    wait $BACKEND_PID $CLIENT_PID

# Run local turtlecode CLI for development (builds + runs with auto backend start)
turtlecode *ARGS:
    cd packages/cli && bun run build && node bin/cli.mjs {{ARGS}}

# Local npm publish (prefer CI: publish-turtlecode.yml — see TRELLIS/tooling/RELEASING.md)
# Publish the current turtlecode version to npm with automatic version bumping.
#
# Auth: set NPM_TOKEN in TRELLIS desk `.env` (loaded automatically). Skips the
#       Continue prompt when a token is present. Use `--yes` to skip without a token.
#
# Usage: just publish [patch|minor|major|version] [extra-flags...]
#        just publish --dry-run
#        just publish patch --yes
publish bump='patch' *args='':
    #!/usr/bin/env bash
    set -euo pipefail

    for envfile in "../.env" ".env"; do
      if [[ -f "$envfile" ]]; then
        set -a
        # shellcheck disable=SC1091
        source "$envfile"
        set +a
        break
      fi
    done

    cd packages/cli
    current=$(node -p "require('./package.json').version")

    bump_val="{{bump}}"
    extra_args="{{args}}"

    if [[ $bump_val == -* ]]; then
        extra_args="$bump_val $extra_args"
        bump_val="patch"
    fi

    new=$(node -e "
        const cur='$current'.split('.').map(Number);
        const b='$bump_val';
        let out;
        if (b==='major') { cur[0]++; cur[1]=0; cur[2]=0; out = cur.join('.'); }
        else if (b==='minor') { cur[1]++; cur[2]=0; out = cur.join('.'); }
        else if (b==='patch') { cur[2]++; out = cur.join('.'); }
        else if (/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(b)) { out = b; }
        else { console.error('Invalid bump: ' + b); process.exit(1); }
        console.log(out);
    ")
    head=$(cd ../.. && git rev-parse --short HEAD)
    branch=$(cd ../.. && git rev-parse --abbrev-ref HEAD)

    echo ""
    echo "════ Publish Trellis Studio ═══════════════════════════"
    echo "  turtlecode    $current → $new"
    echo "  + turtlecode-backend-<platform>-<arch> (all targets)"
    echo "  source:       $branch @ $head"
    echo "═══════════════════════════════════════════════════════"
    echo ""

    skip_confirm=false
    if [[ -n "${NPM_TOKEN:-}" || -n "${NODE_AUTH_TOKEN:-}" ]]; then
        skip_confirm=true
    fi
    if [[ " $extra_args " =~ " --yes " || " $extra_args " =~ " -y " ]]; then
        skip_confirm=true
    fi

    if [[ ! " $extra_args " =~ " --dry-run " && "$skip_confirm" != true ]]; then
        read -p "Continue? [y/N] " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Cancelled. No changes made."
            exit 1
        fi
    fi

    if [[ ! " $extra_args " =~ " --dry-run " ]]; then
        node -e "
            const fs = require('fs');
            const path = 'package.json';
            const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
            pkg.version = '$new';
            fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
        "
    else
        echo "[dry-run] Would update package.json version to $new"
    fi

    bun script/publish.ts $extra_args

# Resume a publish at the CURRENT version (no bump, no rebuild). Use this when
# `just publish` failed partway through — publish.ts is idempotent and will skip
# anything already on the registry.
#
# Usage: just publish-resume
#        just publish-resume --otp 123456
publish-resume *ARGS:
    #!/usr/bin/env bash
    set -euo pipefail
    for envfile in "../.env" ".env"; do
      if [[ -f "$envfile" ]]; then
        set -a
        # shellcheck disable=SC1091
        source "$envfile"
        set +a
        break
      fi
    done
    bun packages/cli/script/publish.ts --no-build {{ARGS}}

# Alias to just publish for backwards compatibility.
publish-studio bump='patch' *args='':
    just publish {{bump}} {{args}}
