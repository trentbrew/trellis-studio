# OpenCode / Trellis Project Guide

> OpenCode is an AI coding agent with an embedded EAV graph database (Trellis) for causal memory and version control.

## Important Project Context

- **Default branch**: `dev` (not `main`)
- **JavaScript SDK**: Regenerate with `./packages/sdk/js/script/build.ts`
- **Prefer automation**: Execute requested actions without confirmation unless blocked by missing info or safety/irreversibility

## Environment Reconnaissance (MANDATORY)

BEFORE running servers, tests, or interacting with network ports, you MUST build a model of the current system state. Do not assume the environment is blank.

1. **Grep for Port Configs**: `grep -r "PORT\|listen\|3000\|8080\|4444" --include="*.{js,ts,env*,json*}"`
2. **Check Active Listeners**: `lsof -i -P -n | grep LISTEN`
3. **Check Running Processes**: `ps aux | grep -E "vite|next|nuxt|node|bun"`

Match detected processes with project structure. If a dev server is already running, use it or connect to it instead of starting a new one.

---

## Quick Reference

### TrellisVCS (Not Git!)

Trellis is graph-native version control with immutable ops. Key commands:

```bash
trellis status              # Check branch, op count, tracked files
trellis log --limit 20      # Op history
trellis milestone create -m "msg"  # Narrative checkpoint
trellis branch feature/name # Create/switch branches
trellis garden list         # Check abandoned work
trellis garden search -k "keyword" # Search garden
trellis sdiff old.ts new.ts # AST-level semantic diff
```

### Running Development Servers

```bash
# Backend (packages/opencode)
bun run --conditions=browser ./src/index.ts serve --port 4096

# App (packages/app)
bun dev -- --port 4848

# Then open http://localhost:4848
```

---

## Style Guide

### Naming (MANDATORY)

- Use **single word** names by default for variables, params, helper functions
- Multi-word names only when necessary for clarity
- Good: `pid`, `cfg`, `err`, `opts`, `dir`, `root`, `child`, `state`
- Bad: `existingClient`, `connectTimeout`, `workerPath`

```ts
// Good
const foo = 1
function journal(dir: string) {}

// Bad
const fooBar = 1
function prepareJournal(dir: string) {}
```

### Variables & Control Flow

- Prefer `const` over `let`
- Use ternaries or early returns instead of reassignment
- Avoid `else` statements

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Destructuring

Avoid unnecessary destructuring. Use dot notation:

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Schema Definitions (Drizzle)

Use snake_case for field names:

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})
```

---

## New Features (2025-2026)

### Code Previews

Configure preview services in `opencode.jsonc`:

```jsonc
"preview": {
  "services": {
    "client": {
      "port": 3000,
      "type": "web",
      "command": "npm run dev"
    }
  }
}
```

Preview panel supports web, API, and terminal service types.

### Rich Text Editor

The app includes TipTap-based rich text editing:

- `CodeEditor` - Monaco-based code editing
- `MarkdownEditor` - TipTap markdown with frontmatter support
- Inline editing via `createInlineEditorController`

### Trellis Panel

Shows todos/issues from the Trellis graph. Use wiki-links in descriptions:

- `[[TRL-5]]` - Link to issue
- `[[src/engine.ts]]` - Link to file
- `[[decision:DEC-1]]` - Link to decision trace

---

## Testing

- Avoid mocks where possible
- Test actual implementation, do not duplicate logic
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`)
- Run from package dirs: `packages/opencode`

## Type Checking

Always run `bun typecheck` from package directories, never `tsc` directly.

---

## Key Differences from Git

1. **No staging area** — Ops created automatically when files change
2. **Ops are immutable** — Never rewritten, rebased, or deleted
3. **Three-tier ops**: Tier 0 (file), Tier 1 (structural), Tier 2 (semantic/AST)
4. **Milestones ≠ commits** — Span op ranges with narrative messages
5. **Idea Garden** — Auto-detects abandoned work for revival
