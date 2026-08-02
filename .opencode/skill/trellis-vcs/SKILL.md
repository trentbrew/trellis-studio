---
name: trellis-vcs
description: >
  Skill for TrellisVCS — the graph-native version control and issue tracking system.
  Teaches agents how to manage branches, milestones, issues, the Idea Garden, and
  semantic AST-level diffs using the Trellis CLI. Use this skill when working
  inside a Trellis-enabled workspace or repository, context-switching between issues,
  tracking changes, or checking the state of a project.
created: 2026-05-30
updated: 2026-07-11
---

# TrellisVCS Skill

TrellisVCS is a local-first version control and issue tracking engine powered by
Trellis. Instead of text-level commits, it tracks code changes as graph-native
EAV operations. It offers branches, milestones, task tracking with automated
verification gates, and the "Idea Garden" (a way to discover and revive
abandoned reasoning or context-switches).

## Mental Model: VCS as Agent State

| Agentic Need                 | Trellis CLI Command     | Purpose                                                                        |
| :--------------------------- | :---------------------- | :----------------------------------------------------------------------------- |
| **Episodic Memory**          | `trellis log`           | A complete, causal stream of every action taken in the repository.             |
| **Reasoning Audit**          | `trellis decision`      | Structured traces of tool calls, inputs, outputs, and rationale.               |
| **Exploration / Simulation** | `trellis branch <name>` | Creating a safe fork of the environment to test a hypothetical implementation. |
| **Task Checkpoint**          | `trellis milestone`     | A narrative summary of a completed objective or sub-goal.                      |
| **Knowledge Retrieval**      | `trellis query`         | Querying the EAV graph for related files, issues, or prior decisions.          |
| **Conflict Resolution**      | `trellis merge`         | Reconciling work from multiple agents or human-in-the-loop edits.              |
| **Memory Retrieval**         | `trellis garden`        | Discovering and reviving abandoned reasoning paths or stale context.           |
| **Parallel agents**          | `trellis lane`          | Isolated per-agent op journals; optional git worktree per lane (W5).           |
| **Handoff audit**            | `trellis protocol send` | Record trellis-handoffs envelope as child issue (ADR 0015).                    |
| **Re-entry**                 | `trellis whereami`      | WAITING / ACTIVE / MOVED since last checkpoint.                                |

### Key Differences from Git

1. **No staging area.** State changes and file mutations are recorded
   automatically on change (usually via `trellis watch`).
2. **Ops are immutable.** They are never rewritten, rebased, or deleted.
3. **Three-tier ops:** Tier 0 (file-level), Tier 1 (structural), Tier 2
   (semantic/AST).
4. **Milestones $\neq$ commits.** A milestone spans a _range_ of operations and
   carries a narrative message.
5. **Idea Garden.** Automatically detects abandoned work (context-switches,
   stale branches, reverts) and lets you revive it.

---

## Core CLI Workflows

### 1. Starting Work and Context Check

Always check status and check the Idea Garden for existing context before
starting fresh:

```bash
# Check current branch, op counts, and untracked files
trellis status

# View recent causal history
trellis log --limit 20

# Search the Garden for abandoned work before starting fresh
trellis garden list
trellis garden search -k "<keyword>"
```

### 2. Issue Lifecycle (The Golden Path)

Always use `trellis issue start TRL-N` (instead of manual branching) — it
creates a linked branch with full traceability and automatically sets the status
to `in_progress`.

```bash
# 1. Create a task (defaults to 'backlog' status)
trellis issue create -t "Add Python parser" -P high -l parser \
  --desc "Short description of the task" \
  --ac "test:bun test test/semantic/python" \
  --ac "Handles decorators and async functions"

# 2. Triage task (move from backlog to queue/open)
trellis issue triage TRL-1

# 3. Start working (auto-creates branch + agent lane, auto-assigns, and checks out)
trellis issue start TRL-1
# Opt out of lane isolation: trellis issue start TRL-1 --no-lane

# 4. Check status of current issue & verify criteria
trellis issue active
trellis issue check TRL-1

# 5. Pause when context-switching (safely switches back to main/default)
trellis issue pause TRL-1

# 6. Resume when context-switching back
trellis issue resume TRL-1

# 7. Close (runs all acceptance criteria, requires confirmation)
trellis issue close TRL-1 --confirm
```

### 3. Agent Lanes (multi-agent isolation)

Lanes give each agent an isolated op journal under
`.trellis/lanes/lane-{uuid}/`. Promote explicitly into `main` (or another target
branch) when work is ready.

**Three “lane” concepts — do not confuse them:**

| Concept               | Id form                            | Purpose                                                |
| :-------------------- | :--------------------------------- | :----------------------------------------------------- |
| **VCS lane**          | `lane-{uuid}`                      | Isolated file/op journal; optional git worktree        |
| **Graph MCP lane**    | `agent:<client-id>`                | Write attribution on graph entities (`create_node`, …) |
| **Desk trail marker** | `graph/trail-markers/agent-*.json` | Coordination metadata only — not VCS                   |

**Enable per-lane git worktrees (W5, ADR 0014):** auto-enabled on `trellis init`
when `.git` exists, or set in `.trellis/config.json`:

```json
{
  "lanes": { "worktreeBind": true },
  "git": { "syncOnPromote": true, "remote": "origin", "pushOnClose": false }
}
```

**Cursor tabs:** each conversation gets its own session lane automatically
(`trellis lane ensure --session <id>` via hooks). Do **not** use profile-static
lanes like `agent:agent-b` for isolation — session binding owns `lane_id`.

Requires trellis **3.2.5+** (or local `bun src/cli/index.ts` during kernel dev).

**Live dashboard:** `trellis lane watch` — browser SSE view of lanes, claims,
and promote lock (port 3939).

```bash
# Golden path (issue start creates + enters a lane by default)
trellis issue start TRL-1

# Session isolation (hooks call this automatically)
trellis lane ensure --session <cursor-conversation-id> --enter

# Or manage lanes directly
trellis lane create [--from main] [--issue TRL-N] [--session <id>]
trellis lane enter <lane-id>          # materializes lane blobs → worktree when bound
trellis lane status [id]              # shows worktree path when provisioned
trellis lane promote <lane-id> [--dry-run] [--explain]   # auto git commit when git.syncOnPromote
trellis git sync [--push]             # manual mirror integration → main
trellis lane drop <lane-id>           # removes worktree when bound
trellis lane watch [--port 3939]      # live SSE dashboard (demos / multi-tab sanity)

# Close + optional push
trellis issue close TRL-1 --confirm [--push]

# Subprocess agents (Cursor hooks, harness) auto-enter via env
export TRELLIS_LANE_ID=lane-…
export TRELLIS_EDIT_ROOT=/path/to/worktree   # when worktreeBind on
```

When `worktreeBind` is on, **edit files under the lane worktree**
(`.trellis/worktrees/<shortId>/`), not the shared repo root. `enterLane` rebinds
the file watcher to that path. **Git is a downstream mirror** — never
`git stash/checkout/merge`; Trellis owns semantics.

**Git adapter:** successful `lane promote` runs `git sync` on `main` with a
commit message derived from the op log + issue title. Agents must not commit
manually.

Promote before `trellis issue close` if the lane has unpromoted ops — **or** let
close auto-promote (default since 3.2.4).

### Issue claim lock (Phase 2)

One active lane/session per in-progress issue:

- `trellis issue start TRL-N` claims the issue for the session lane
- A second tab/session gets a hard error if it tries the same issue
- `trellis issue pause` releases the claim for handoff
- `trellis issue close --confirm` auto-promotes unpromoted lane ops, then closes
  (use `--no-promote` to require manual promote first)
- Promote mutex: only one `lane promote` runs at a time per repo
  (`.trellis/locks/promote.lock`)

### 5. Test runner (manifest + vcs:testRun)

Define suites once in `.trellis/tests.json`; issues reference suite ids; runs
emit `vcs:testRun` ops on the causal stream.

```json
{
  "version": 1,
  "defaultSuite": "unit",
  "suites": {
    "unit": { "description": "Unit tests", "command": "bun test test/vcs" }
  },
  "promote": { "require": ["unit"] },
  "issueStart": {
    "default": [{ "description": "Unit tests pass", "suite": "unit" }]
  },
  "issueLabels": {
    "needs-e2e": [{ "description": "E2E suite passes", "suite": "e2e" }],
    "impl": [{ "description": "VCS smoke passes", "suite": "smoke" }]
  }
}
```

```bash
trellis test                  # defaultSuite (or all suites)
trellis test unit             # named suite
trellis test --list           # show manifest
trellis issue ac TRL-1 "Unit green" --suite unit
trellis issue start TRL-1     # auto-attaches criteria from issueStart + issueLabels
trellis issue check TRL-1     # lane-aware; resolves --suite criteria
trellis lane promote <id> --require-test
```

`issue check` and `trellis test` run commands under the **lane worktree** when
`lanes.worktreeBind` is on and a lane is active.

### 6. Branching & Milestones

For ad-hoc exploration, use standard branches and record checkpoints via
narrative milestones:

```bash
# Create/switch to a branch
trellis branch feature/new-parser

# List all branches
trellis branch

# Create a milestone checkpoint (replaces commits as the unit of narrative)
trellis milestone create -m "Implement basic parser AST nodes"
```

### 5. Semantic Code Analysis

Use semantic parsers and diffs to evaluate code changes at the AST (symbol)
level:

```bash
# Parse a file into AST entities
trellis parse src/engine.ts

# Generate semantic diff (tracks symbol additions, removals, and renames)
trellis sdiff src/old.ts src/new.ts
```

### 6. Managing the Idea Garden

The Idea Garden stores abandoned reasoning clusters and dead paths. You can
revive them at any point:

```bash
# List all abandoned clusters
trellis garden list

# Search for dead/stale work by keyword
trellis garden search -k "auth"

# Revive a cluster into a new, active branch
trellis garden revive <cluster-id>
```

### 7. Decision Traces

Trellis automatically tracks MCP tool calls and shell operations as
`DecisionTrace` entities. Use them to trace the rationale behind changes:

```bash
# See recent agent decisions
trellis decision list

# Trace the sequence of decisions affecting a specific issue or file
trellis decision chain issue:TRL-5
```

### 8. Agent handoff protocol (3.2.3+)

Multi-agent pipelines use trellis-handoffs YAML footers in chat; **persist**
them on the graph for audit and re-entry (ADR 0015).

```bash
# Record envelope as child issue (label: message | decision)
trellis protocol send --parent TRL-41 \
  --from reviewer --to strategist --re TRL-41 --status HANDOFF \
  --body "REVIEW: PASS — route to strategist"

# Orientation after tab switch / human return
trellis whereami
trellis whereami checkpoint
```

Requires trellis **3.2.3+**. Pair with `lanes.worktreeBind` when dogfooding
concurrent lane isolation.

---

## Critical Rules

- **Never** modify the `.trellis/` directory directly — let the Trellis engine
  handle operations.
- **Lane writes only** — when `TRELLIS_LANE_ID` is set (or after `lane enter`),
  file ops go to the lane journal; promote before merging to integration.
- **Worktree cwd** — with `lanes.worktreeBind`, edit under
  `.trellis/worktrees/<shortId>/`, not the shared repo root.
- **Protocol messages** — on pipeline handoffs, prefer `trellis protocol send`
  over chat-only footers when graph audit matters.
- **Re-entry** — run `trellis whereami` (or `whereami checkpoint` on session
  end) before resuming multi-agent work.
- **Start issues, don't just branch** — `trellis issue start` provides deep
  integration, auto-lane, and history tracking.
- **Pause before context-switching** — always run `trellis issue pause` to
  switch branches cleanly.
- **Two-phase close gate** — all issue acceptance criteria must pass, and
  `--confirm` is required to close an issue.
- **Add descriptions** — use `--desc` on create or `trellis issue describe` for
  short descriptions.
