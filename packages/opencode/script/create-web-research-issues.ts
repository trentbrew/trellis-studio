#!/usr/bin/env bun
/**
 * One-shot: record agent web research upgrade work in Trellis.
 * Run: bun packages/opencode/script/create-web-research-issues.ts
 */
import { TrellisVcsEngine } from "trellis"

const dir = process.argv[2] ?? process.cwd()

if (!TrellisVcsEngine.isRepo(dir)) {
  console.error("Not a Trellis repo:", dir)
  process.exit(1)
}

const eng = new TrellisVcsEngine({ rootPath: dir })
eng.open()

const existing = eng.listIssues({ label: "web-research" })
if (existing.some((i) => i.title.includes("Agent web research stack upgrade"))) {
  console.log("Already tracked:")
  for (const i of existing) console.log(`  ${i.id} ${i.title}`)
  process.exit(0)
}

type Spec = {
  title: string
  priority: "critical" | "high" | "medium" | "low"
  labels: string[]
  description: string
  ac?: string[]
  parentId?: string
}

const epicSpec: Spec = {
  title: "Agent web research stack upgrade",
  priority: "high",
  labels: ["milestone", "agent", "web-research", "tools"],
  description: [
    "Replace brittle DuckDuckGo MCP search with a tiered research stack for Turtlecode agents.",
    "",
    "Current state: built-in `websearch` uses Exa AI but is gated to the OpenCode provider unless `OPENCODE_ENABLE_EXA=1`. When unavailable, agents fall back to weak MCP search (e.g. DuckDuckGo).",
    "",
    "Target stack:",
    "1. **Always-on Exa websearch** — single-query search with citations and verification prompts.",
    "2. **Parallel Web Search provider** — port upstream OpenCode dual-provider support.",
    "3. **Gemini Deep Research tool** — async multi-step investigation via Interactions API for heavy research.",
    "4. **Research subagent** — orchestrates search + fetch + synthesis for plan-mode and general research tasks.",
    "",
    "Spec: specs/agent-web-research.md (to be written).",
  ].join("\n"),
  ac: [
    "specs/agent-web-research.md documents tiers, tool selection, and citation requirements",
    "Child issues are filed and linked as sub-tasks of the milestone epic",
  ],
}

const epicOp = await eng.createIssue(epicSpec.title, {
  priority: epicSpec.priority,
  labels: epicSpec.labels,
  description: epicSpec.description,
  criteria: epicSpec.ac?.map((description) => ({ description })),
})
const epicId = epicOp.vcs?.issueId as string
console.log("milestone", epicId)

const children: Spec[] = [
  {
    title: "Enable Exa websearch for all providers",
    priority: "high",
    labels: ["agent", "web-research", "websearch", "exa"],
    description: [
      "Remove the provider gate that hides `websearch` and `codesearch` unless `model.providerID === opencode` or `OPENCODE_ENABLE_EXA=1`.",
      "",
      "Files: `packages/opencode/src/tool/registry.ts`, possibly `packages/opencode/src/flag/flag.ts`.",
      "",
      "Agents on Gemini, Anthropic, Ollama, etc. should get the native Exa-backed `websearch` tool without extra env vars.",
    ].join("\n"),
    ac: [
      "websearch registers for non-opencode providers without OPENCODE_ENABLE_EXA",
      "test: bun test packages/opencode/test/tool/websearch.test.ts",
    ],
    parentId: epicId,
  },
  {
    title: "Port Parallel Web Search provider from upstream OpenCode",
    priority: "medium",
    labels: ["agent", "web-research", "websearch", "parallel"],
    description: [
      "Port dual-provider websearch from `.references/opencode`: `selectWebSearchProvider`, `mcp-websearch` helper, `OPENCODE_WEBSEARCH_PROVIDER` override, and Parallel auth headers.",
      "",
      "Enables switching between Exa and Parallel without code changes.",
    ].join("\n"),
    ac: [
      "websearch supports exa and parallel providers",
      "OPENCODE_WEBSEARCH_PROVIDER env selects provider",
      "test: provider selection covered in websearch tests",
    ],
    parentId: epicId,
  },
  {
    title: "Add Gemini Deep Research tool via Interactions API",
    priority: "high",
    labels: ["agent", "web-research", "deep-research", "gemini"],
    description: [
      "Add a native `deep_research` tool that calls Gemini Deep Research through the Interactions API.",
      "",
      "Async/long-running: create interaction, poll until complete, return synthesized report with citations. Opt-in for high-stakes or exhaustive research; gated by permission.",
      "",
      "Requires `GEMINI_API_KEY` (or existing Gemini provider config).",
    ].join("\n"),
    ac: [
      "deep_research tool registered in tool registry",
      "Creates interaction, polls for completion, returns report + citations",
      "Permission gate deep_research (default allow for primary agent)",
      "test: unit test with mocked Interactions API response",
    ],
    parentId: epicId,
  },
  {
    title: "Add research subagent for multi-step web investigation",
    priority: "medium",
    labels: ["agent", "web-research", "subagent"],
    description: [
      "Add a `research` subagent mode specialized for external investigation: multiple websearch queries, webfetch on primary sources, corroboration, and structured output.",
      "",
      "Use from plan mode (Phase 1) and when users ask open-ended research questions. Can delegate to deep_research for exhaustive tasks.",
    ].join("\n"),
    ac: [
      "research subagent defined in agent.ts with websearch, webfetch, deep_research permissions",
      "Prompt enforces multi-step search, source verification, and citation in final answer",
      "Plan mode system prompt references research subagent for non-codebase questions",
    ],
    parentId: epicId,
  },
]

for (const child of children) {
  const op = await eng.createIssue(child.title, {
    priority: child.priority,
    labels: child.labels,
    description: child.description,
    parentId: child.parentId,
    criteria: child.ac?.map((description) => ({
      description: description.startsWith("test:") ? description.slice(5) : description,
      command: description.startsWith("test:") ? description.slice(5) : undefined,
    })),
  })
  console.log("child", op.vcs?.issueId, child.title)
}

const milestone = await eng.createMilestone(
  `Agent web research stack tracked in Trellis: epic ${epicId} with Exa ungating, Parallel provider, Gemini Deep Research tool, and research subagent.`,
)
console.log("vcs-milestone", milestone.vcs?.milestoneId ?? milestone.hash)
