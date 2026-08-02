# Harness model benchmark

> **Status:** v1 — agent-ops schema + Cursor postToolUse/shell/MCP hooks + scorer; OpenCode eval placeholders for v2.  
> **Tooling:** [`tooling/harness-bench/README.md`](../../tooling/harness-bench/README.md)

## Problem

We change the **default hosted model** (e.g. MiniMax M3 Free) based on cost and quality, but "quality" in Trellis means more than benchmark coding puzzles:

- Does the agent read **graph state** instead of stale markdown?
- Does it use **`trellis` VCS** for issues/milestones?
- Do desk **hooks** see real tool traffic in `.trellis/agent-ops/`?

Without a harness score, model swaps are guesswork.

## Harness score (0–100)

| Pillar | Weight | Source (v0) | Source (v2) |
| ------ | ------ | ----------- | ----------- |
| Graph-native | 40% | MCP / briefing patterns in agent-ops | + `Trellis.evalSummary` graph queries |
| VCS discipline | 25% | `trellis issue|milestone|log` in shell ops | + repo op stream |
| Harness visibility | 20% | Non-empty agent-ops log | + decision entities |
| Efficiency | 15% | Redundant tool repetition | + tokens / turns |

**Scenario acceptance** (must-use / must-not) is layered on top for pass/fail gates.

## Runner phases

```text
scenarios.json
      │
      ▼
┌─────────────┐     ┌──────────────────┐
│ Manual v0   │────►│ score-ops.ts     │──► per-model JSON
│ (Cursor /   │     │ (agent-ops jsonl)│
│  Studio)    │     └────────┬─────────┘
└─────────────┘              │
                             ▼
                    ┌──────────────────┐
                    │ report.ts        │──► leaderboard
                    └──────────────────┘

Future v2: OpenCode session API × N models → same scorer + evalSummary
```

## Default model policy

Hosted default (`HOSTED_CLOUD_DEFAULT_MODEL_ID`) should be the **highest harness score** among free Zen models that pass smoke scenarios, not the newest nameplate. Re-benchmark when:

- OpenCode Zen catalog changes
- Harness hooks gain new fields (`mcp_server`, `command`)
- Scenario set grows

## OpenCode integration

`studio/packages/opencode/src/trellis/eval.ts` exports `summary`, `agentReport`, `sessionReport`, `scoreIssue` — currently placeholders. v2 should implement:

- `harnessScoreFromOps(ops, decisions)` shared with desk scorer
- HTTP route or CLI: `trellis bench score --directory <workspace>`

## Non-goals

- SWE-bench / HumanEval replacement
- Latency/cost-only leaderboards (track separately)
- Blocking releases on harness score until v2 automation exists
