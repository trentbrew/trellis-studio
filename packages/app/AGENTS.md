## Debugging

- NEVER try to restart the app, or the server process, EVER.

See [ONTOLOGY.md](./ONTOLOGY.md) for Studio shell regions, layout patterns, and composite IDs. UI primitives: [packages/ui/ONTOLOGY.md](../ui/ONTOLOGY.md).

## Local Dev

- `opencode dev web` proxies `https://app.opencode.ai`, so local UI/CSS changes will not show there.
- For local UI changes, run the backend and app dev servers separately.
- Backend (from `packages/opencode`): `bun run --hot --conditions=browser ./src/index.ts serve --port 4096`
- App (from `packages/app`): `bun dev -- --port 4848`
- Open `http://localhost:4848` to verify UI changes (it targets the backend at `http://localhost:4096`).
- The `--hot` flag is required so backend changes (new routes, schema updates, regenerated SDK) are picked up without restarting. Without it, requests to new routes silently fall through to the SPA catch-all and return `200 OK` with `index.html`, which can mask errors as false success.
- `just run` / `jr` already pass these flags — no need to type them manually.

## Database panel (Trellis store)

Custom entities (`person:`, `organization:`, `bookmark:`, `asset:`, …) live in **`.trellis/ops.json`** as `vcs:storeAssert` / `storeLink` ops. The UI reads the **materialized** in-memory store via `/trellis/store/*`, not the raw JSON file.

### “Empty database” / missing CMS entities

This is usually **not data loss**. Ops are append-only; facts are still on disk.

| What you see | Likely cause |
| --- | --- |
| Sidebar shows mostly `Decision`, `FileNode`, …; no `person` / `organization` | `decompose()` did not replay store ops on materialization (fixed in kernel ADR 0008) |
| Agent reports zero org/person after querying `entity:` ids only | Different id prefix — CMS uses `person:slug`, not `entity:uuid` |
| Stats show entities but Database tabs are empty | Store not hydrated yet — open Records/Facts tab or wait for `/store/entities` fetch |

**Verify:** search `ops.json` for the entity id, then `GET /trellis/store/entity/<id>?directory=<home>`. If ops exist but API returns 404, restart backend (`jr`) after updating the bundled `trellis` package.

**Spec:** [kernel ADR 0008](../../../../TRELLIS/kernel/docs/adr/0008-store-op-decomposition.md)

## SolidJS

- Always prefer `createStore` over multiple `createSignal` calls

## Claude Code companion (ACP) — CC0+

Subscription-backed Claude in the **agent sidebar** uses [Agent Client Protocol](https://agentclientprotocol.com/) via `@zed-industries/claude-code-acp`, not OpenCode provider OAuth.

| Item | Path / command |
| ---- | ---------------- |
| Spec | `specs/claude-code-acp-companion.md` (graph: **TRL-185** epic, **TRL-187–193**) |
| Bridge pin | `@zed-industries/claude-code-acp@0.16.2` + `@agentclientprotocol/sdk@0.14.1` (devDeps in `packages/app`) |
| Spike | `cd packages/app && bun run acp:spike` |
| Unit tests | `cd packages/app && bun test src/agent/acp-event-adapter.test.ts` |
| Live integration | `TRELLIS_ACP_SPIKE_LIVE=1 bun test src/agent/acp-spike.integration.test.ts` |

**Auth:** run `claude login` on the **same machine** as the OpenCode/Studio backend (port 4096 host), not only in the browser.

**Browser bundle:** `acp-client.ts` / `bridge-path.ts` use Node (`createRequire`) and must **not** be imported from client UI until CC2 (host-side bridge or proxy). `AgentBackendProvider` uses a browser placeholder for `claude-acp`; spike/CLI imports `./src/agent/acp-client.ts` directly.

## Tool Calling

- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes
