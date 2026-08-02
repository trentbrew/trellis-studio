<p align="center">
  <img src="packages/app/public/logo.svg" alt="Turtlecode logo" width="96" />
</p>

<p align="center">The AI-powered creative workspace with a semantic graph memory.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/turtlecode"><img alt="npm" src="https://img.shields.io/npm/v/turtlecode?style=flat-square" /></a>
  <a href="https://github.com/trentbrew/trellis-studio/actions"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/trentbrew/trellis-studio/typecheck.yml?style=flat-square&branch=dev" /></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/trentbrew/trellis-studio?style=flat-square" /></a>
</p>

Turtlecode is an open-source, browser-native creative workspace that combines AI-assisted code generation, rich document editing, and one-click publishing — backed by a semantic graph that connects every artifact you create to every other.

It is a fork of [OpenCode](https://github.com/anomalyco/opencode), the open-source AI coding agent, extended with an embedded EAV graph database (Trellis) for causal memory and graph-native version control.

## Quick start

```bash
npx turtlecode
```

This serves the workspace in your browser.

## What makes it different

- **Semantic graph memory** — everything you make becomes an entity in a local EAV graph; artifacts link to each other instead of living in isolated projects.
- **Graph-native version control** — immutable, append-only op log (Trellis) instead of snapshots.
- **Provider-agnostic agent** — works with OpenCode, Anthropic, OpenAI, Google, or local models.
- **Browser-native studio** — a rich UI for code, documents, and whiteboards in one connected workspace.

## Monorepo layout

| Package | Description |
| ------- | ----------- |
| `packages/app` | Browser studio UI (SolidJS + Vite) |
| `packages/cli` | `turtlecode` npm package — launch the workspace |
| `packages/opencode` | The agent core (OpenCode fork + Trellis kernel) |
| `packages/ui` | Shared design system |
| `packages/sdk` | Client SDKs (JS + OpenAPI) |
| `packages/console` | Cloud console |
| `packages/desktop` / `packages/desktop-electron` | Desktop shells (Tauri / Electron) |
| `packages/docs` | Documentation |
| `packages/whiteboard` | Excalidraw-based whiteboard |

## Development

Requires [Bun](https://bun.sh) (see `packageManager` in `package.json`).

```bash
bun install

# Studio UI
bun run dev:web

# Agent core
bun run dev
```

Typecheck from any package dir:

```bash
bun --cwd packages/opencode typecheck
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md) for repo conventions before opening a PR.

## License

MIT — see [LICENSE](./LICENSE).

This project is a fork of [OpenCode](https://github.com/anomalyco/opencode). It is not affiliated with the OpenCode team.
