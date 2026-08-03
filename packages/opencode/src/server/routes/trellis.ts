import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { existsSync, statSync } from "node:fs"
import { Trellis } from "../../trellis"
import { Note } from "../../trellis/note"
import { CalendarEvent, type CalendarEventColor, type CalendarEventType } from "../../trellis/calendar-event"
import * as SemanticLinks from "../../trellis/semantic-links"
import { CsvImportBody, CsvImportResult, importCsv } from "../../trellis/csv-import"
import { ProjectBrand } from "../../trellis/project-brand"
import { MCP } from "../../mcp"
import { lazy } from "../../util/lazy"

const dirQuery = z.object({ directory: z.string().optional() })
const factBody = z.object({ facts: Trellis.Fact.array(), meta: Trellis.StoreMetaSchema.optional() })
const linkBody = z.object({ links: Trellis.LinkSchema.array(), meta: Trellis.StoreMetaSchema.optional() })

const lastInitError = new Map<string, string>()

async function ensure(dir?: string) {
  if (Trellis.engine(dir)) {
    lastInitError.delete(dir ?? "")
    return true
  }
  if (dir && (!existsSync(dir) || !statSync(dir).isDirectory())) {
    const msg = `directory does not exist: ${dir}`
    lastInitError.set(dir, msg)
    return false
  }
  try {
    const eng = await Trellis.init(dir)
    if (!eng) {
      lastInitError.set(dir ?? "", "init returned undefined")
      return false
    }
    lastInitError.delete(dir ?? "")
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error && err.stack ? `\n${err.stack}` : ""
    console.error(`[trellis] init failed dir=${dir ?? "<default>"} error=${msg}${stack}`)
    lastInitError.set(dir ?? "", msg)
    return false
  }
}

function initErrorBody(dir?: string) {
  const err = lastInitError.get(dir ?? "")
  return { error: "Trellis not initialized", reason: err ?? "engine not created for directory", directory: dir }
}

export const TrellisRoutes = lazy(() =>
  new Hono()
    .get(
      "/status",
      describeRoute({
        summary: "Get trellis status",
        description: "Get the current TrellisVCS status: branch, op count, tracked files, and recent activity.",
        operationId: "trellis.status",
        responses: {
          200: {
            description: "Trellis repository status",
            content: {
              "application/json": {
                schema: resolver(Trellis.Status),
              },
            },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        if (!(await ensure(q.directory))) {
          return c.json({
            branch: "main",
            totalOps: 0,
            trackedFiles: 0,
            lastOp: null,
            recentOps: [],
          })
        }
        const s = Trellis.status(q.directory)
        if (!s) {
          return c.json({
            branch: "main",
            totalOps: 0,
            trackedFiles: 0,
            lastOp: null,
            recentOps: [],
          })
        }
        return c.json(s)
      },
    )
    .get(
      "/stats",
      describeRoute({
        summary: "Get trellis graph stats",
        description: "Get summary graph statistics: branch, ops, files, issue counts.",
        operationId: "trellis.stats",
        responses: {
          200: {
            description: "Graph statistics",
            content: {
              "application/json": {
                schema: resolver(Trellis.GraphStats),
              },
            },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        if (!(await ensure(q.directory))) {
          return c.json({
            branch: "main",
            totalOps: 0,
            trackedFiles: 0,
            hiddenFiles: 0,
            hiddenDirs: 0,
            hiddenNodes: 0,
            issueCount: 0,
            activeIssues: 0,
            nodeCount: 0,
            edgeCount: 0,
            avgIssueHealth: 100,
          })
        }
        const s = Trellis.stats(q.directory)
        if (!s) {
          return c.json({
            branch: "main",
            totalOps: 0,
            trackedFiles: 0,
            hiddenFiles: 0,
            hiddenDirs: 0,
            hiddenNodes: 0,
            issueCount: 0,
            activeIssues: 0,
            nodeCount: 0,
            edgeCount: 0,
            avgIssueHealth: 100,
          })
        }
        return c.json(s)
      },
    )
    .get(
      "/issues",
      describeRoute({
        summary: "List trellis issues",
        description: "List all issues, optionally filtered by status.",
        operationId: "trellis.issues",
        responses: {
          200: {
            description: "List of issues",
            content: {
              "application/json": {
                schema: resolver(Trellis.Issue.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          status: z.string().optional(),
        }),
      ),
      async (c) => {
        const filter = c.req.valid("query")
        return c.json(Trellis.issues(filter.directory, filter.status ? { status: filter.status } : undefined))
      },
    )
    .get(
      "/issues/active",
      describeRoute({
        summary: "List active issues",
        description: "Get all in-progress/queue issues.",
        operationId: "trellis.issues.active",
        responses: {
          200: {
            description: "Active issues",
            content: { "application/json": { schema: resolver(Trellis.Issue.array()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.activeIssues(q.directory))
      },
    )
    .get(
      "/issues/:id",
      describeRoute({
        summary: "Get trellis issue details",
        description: "Get full details for a single issue, including acceptance criteria.",
        operationId: "trellis.issue",
        responses: {
          200: {
            description: "Issue details",
            content: {
              "application/json": {
                schema: resolver(Trellis.Issue),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
        }),
      ),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const i = await Trellis.getIssue(id, q.directory)
        if (!i) return c.json({ error: `Issue ${id} not found` }, 404)
        return c.json(i)
      },
    )
    .post(
      "/issues/:id/check",
      describeRoute({
        summary: "Run issue acceptance criteria",
        description: "Execute all executable acceptance criteria for a given issue.",
        operationId: "trellis.issue.check",
        responses: {
          200: {
            description: "Check results",
            content: {
              "application/json": {
                schema: resolver(z.array(z.any())),
              },
            },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const results = await Trellis.checkIssue(id, q.directory)
        if (!results) return c.json({ error: `Failed to check issue ${id}` }, 500)
        return c.json(results)
      },
    )
    .post(
      "/issues",
      describeRoute({
        summary: "Create trellis issue",
        description: "Create a new issue in the trellis backlog.",
        operationId: "trellis.issue.create",
        responses: {
          200: {
            description: "Created issue",
            content: {
              "application/json": {
                schema: resolver(Trellis.Issue),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
        }),
      ),
      validator(
        "json",
        z.object({
          title: z.string(),
          priority: z.enum(["critical", "high", "medium", "low"]).optional(),
          labels: z.array(z.string()).optional(),
          description: z.string().optional(),
          criteria: z
            .array(
              z.object({
                description: z.string(),
                command: z.string().optional(),
              }),
            )
            .optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const issue = await Trellis.createIssue(
          body.title,
          {
            priority: body.priority,
            labels: body.labels,
            description: body.description,
            criteria: body.criteria,
          },
          q.directory,
        )
        if (!issue) return c.json({ error: "Failed to create issue" }, 500)
        return c.json(issue)
      },
    )
    .put(
      "/issues/:id",
      describeRoute({
        summary: "Update trellis issue",
        description: "Update issue metadata (title, description, status, priority, labels, assignee).",
        operationId: "trellis.issue.update",
        responses: {
          200: {
            description: "Updated issue",
            content: { "application/json": { schema: resolver(Trellis.Issue) } },
          },
        },
      }),
      validator(
        "json",
        z.object({
          title: z.string().optional(),
          description: z.string().optional(),
          status: z.string().optional(),
          priority: z.enum(["critical", "high", "medium", "low"]).optional(),
          labels: z.array(z.string()).optional(),
          assignee: z.string().optional(),
        }),
      ),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.updateIssue(id, body, q.directory)
        if (!result) return c.json({ error: `Failed to update issue ${id}` }, 500)
        const issue = await Trellis.getIssue(id, q.directory)
        if (!issue) return c.json({ error: `Issue ${id} not found after update` }, 500)
        return c.json(issue)
      },
    )
    .post(
      "/issues/:id/start",
      describeRoute({
        summary: "Start working on issue",
        description: "Start an issue: auto-creates branch, assigns agent, transitions to in_progress.",
        operationId: "trellis.issue.start",
        responses: {
          200: {
            description: "Started issue",
            content: { "application/json": { schema: resolver(Trellis.Issue) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const result = await Trellis.startIssue(id, q.directory)
        if (!result) return c.json({ error: `Failed to start issue ${id}` }, 500)
        return c.json(result)
      },
    )
    .post(
      "/issues/:id/pause",
      describeRoute({
        summary: "Pause issue",
        description: "Pause an in-progress issue and switch back to the default branch.",
        operationId: "trellis.issue.pause",
        responses: {
          200: {
            description: "Paused issue",
            content: { "application/json": { schema: resolver(Trellis.Issue) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ note: z.string().optional() }).optional()),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const body = await c.req.json().catch(() => ({}))
        const result = await Trellis.pauseIssue(id, body?.note, q.directory)
        if (!result) return c.json({ error: `Failed to pause issue ${id}` }, 500)
        return c.json(result)
      },
    )
    .post(
      "/issues/:id/resume",
      describeRoute({
        summary: "Resume issue",
        description: "Resume a paused issue and switch to its branch.",
        operationId: "trellis.issue.resume",
        responses: {
          200: {
            description: "Resumed issue",
            content: { "application/json": { schema: resolver(Trellis.Issue) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const result = await Trellis.resumeIssue(id, q.directory)
        if (!result) return c.json({ error: `Failed to resume issue ${id}` }, 500)
        return c.json(result)
      },
    )
    .post(
      "/issues/:id/triage",
      describeRoute({
        summary: "Triage issue",
        description: "Move issue from backlog to queue.",
        operationId: "trellis.issue.triage",
        responses: {
          200: {
            description: "Triaged issue",
            content: { "application/json": { schema: resolver(Trellis.Issue) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const result = await Trellis.triageIssue(id, q.directory)
        if (!result) return c.json({ error: `Failed to triage issue ${id}` }, 500)
        return c.json(result)
      },
    )
    .post(
      "/issues/:id/close",
      describeRoute({
        summary: "Close issue",
        description: "Close an issue. Requires confirm=true and passing acceptance criteria.",
        operationId: "trellis.issue.close",
        responses: {
          200: {
            description: "Closed issue",
            content: { "application/json": { schema: resolver(Trellis.Issue) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ confirm: z.boolean().optional() }).optional()),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const body = await c.req.json().catch(() => ({}))
        const result = await Trellis.closeIssue(id, body?.confirm, q.directory)
        if (!result) return c.json({ error: `Failed to close issue ${id}` }, 500)
        return c.json(result)
      },
    )
    .post(
      "/issues/:id/reopen",
      describeRoute({
        summary: "Reopen issue",
        description: "Reopen a closed issue.",
        operationId: "trellis.issue.reopen",
        responses: {
          200: {
            description: "Reopened issue",
            content: { "application/json": { schema: resolver(Trellis.Issue) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const result = await Trellis.reopenIssue(id, q.directory)
        if (!result) return c.json({ error: `Failed to reopen issue ${id}` }, 500)
        return c.json(result)
      },
    )
    .post(
      "/issues/:id/assign",
      describeRoute({
        summary: "Assign issue",
        description: "Assign an issue to an agent.",
        operationId: "trellis.issue.assign",
        responses: {
          200: {
            description: "Assigned issue",
            content: { "application/json": { schema: resolver(Trellis.Issue) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ agent: z.string() })),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.assignIssue(id, body.agent, q.directory)
        if (!result) return c.json({ error: `Failed to assign issue ${id}` }, 500)
        return c.json(result)
      },
    )
    .post(
      "/issues/:id/block",
      describeRoute({
        summary: "Block issue",
        description: "Mark an issue as blocked by another issue.",
        operationId: "trellis.issue.block",
        responses: {
          200: {
            description: "Block result",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ blockedBy: z.string() })),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.blockIssue(id, body.blockedBy, q.directory)
        if (!result) return c.json({ error: `Failed to block issue ${id}` }, 500)
        return c.json(result)
      },
    )
    .post(
      "/issues/:id/unblock",
      describeRoute({
        summary: "Unblock issue",
        description: "Remove a blocking relation from an issue.",
        operationId: "trellis.issue.unblock",
        responses: {
          200: {
            description: "Unblock result",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ blockedBy: z.string() })),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.unblockIssue(id, body.blockedBy, q.directory)
        if (!result) return c.json({ error: `Failed to unblock issue ${id}` }, 500)
        return c.json(result)
      },
    )
    .post(
      "/issues/:id/criteria",
      describeRoute({
        summary: "Add acceptance criterion",
        description: "Add a new acceptance criterion to an issue.",
        operationId: "trellis.issue.criteria.add",
        responses: {
          200: {
            description: "Updated issue with new criterion",
            content: { "application/json": { schema: resolver(Trellis.Issue) } },
          },
        },
      }),
      validator(
        "json",
        z.object({
          description: z.string(),
          command: z.string().optional(),
        }),
      ),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.addCriterion(id, body.description, body.command, q.directory)
        if (!result) return c.json({ error: `Failed to add criterion to issue ${id}` }, 500)
        return c.json(result)
      },
    )
    // -----------------------------------------------------------------------
    // New 3.x endpoints
    // -----------------------------------------------------------------------
    .get(
      "/readiness",
      describeRoute({
        summary: "Check completion readiness",
        description: "Check if all active issues are ready for completion.",
        operationId: "trellis.readiness",
        responses: {
          200: {
            description: "Completion readiness",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        const result = Trellis.completionReadiness(q.directory)
        if (!result) return c.json({ error: "Not available" }, 404)
        return c.json(result)
      },
    )
    .put(
      "/issues/:id/criteria/:idx",
      describeRoute({
        summary: "Set criterion status",
        description: "Set a specific criterion's pass/fail/pending status by index.",
        operationId: "trellis.issue.criteria.set",
        responses: {
          200: {
            description: "Updated issue",
            content: { "application/json": { schema: resolver(Trellis.Issue) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ status: z.enum(["passed", "failed", "pending"]) })),
      async (c) => {
        const id = c.req.param("id")
        const idx = parseInt(c.req.param("idx"), 10)
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.setCriterionStatus(id, idx, body.status, q.directory)
        if (!result) return c.json({ error: `Failed to set criterion status` }, 500)
        return c.json(result)
      },
    )
    .post(
      "/issues/:id/criteria/run",
      describeRoute({
        summary: "Run all criteria",
        description: "Execute all acceptance criteria for an issue and return results.",
        operationId: "trellis.issue.criteria.run",
        responses: {
          200: {
            description: "Criteria results",
            content: { "application/json": { schema: resolver(z.array(z.any())) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const results = await Trellis.runCriteria(id, q.directory)
        if (!results) return c.json({ error: `Failed to run criteria for ${id}` }, 500)
        return c.json(results)
      },
    )
    .get(
      "/diff/op/:hash",
      describeRoute({
        summary: "Diff from op",
        description: "Diff the current state against a specific op hash.",
        operationId: "trellis.diff.op",
        responses: {
          200: {
            description: "Diff result",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const hash = decodeURIComponent(c.req.param("hash"))
        const q = c.req.valid("query")
        const result = Trellis.diffFromOp(hash, q.directory)
        if (!result) return c.json({ error: "Diff failed" }, 500)
        return c.json(result)
      },
    )
    .get(
      "/diff/branches",
      describeRoute({
        summary: "Diff two branches",
        description: "Compare file states between two branches.",
        operationId: "trellis.diff.branches",
        responses: {
          200: {
            description: "Diff result",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          a: z.string(),
          b: z.string(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const result = Trellis.diffBranches(q.a, q.b, q.directory)
        if (!result) return c.json({ error: "Diff failed" }, 500)
        return c.json(result)
      },
    )
    .get(
      "/diff/ops",
      describeRoute({
        summary: "Diff two ops",
        description: "Diff between two op hashes in the causal stream.",
        operationId: "trellis.diff.ops",
        responses: {
          200: {
            description: "Diff result",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          from: z.string(),
          to: z.string(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const result = Trellis.diffOps(q.from, q.to, q.directory)
        if (!result) return c.json({ error: "Diff failed" }, 500)
        return c.json(result)
      },
    )
    .post(
      "/branches/merge",
      describeRoute({
        summary: "Merge branch",
        description: "Three-way merge source branch into current branch.",
        operationId: "trellis.branches.merge",
        responses: {
          200: {
            description: "Merge result",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ source: z.string() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = Trellis.mergeBranch(body.source, q.directory)
        if (!result) return c.json({ error: "Merge failed" }, 500)
        return c.json(result)
      },
    )
    .post(
      "/parse",
      describeRoute({
        summary: "Parse file",
        description: "Parse a file's content into AST-level entities.",
        operationId: "trellis.parse",
        responses: {
          200: {
            description: "Parse result",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ content: z.string(), path: z.string() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = Trellis.parseFile(body.content, body.path, q.directory)
        return c.json(result ?? { entities: [] })
      },
    )
    .post(
      "/semantic-diff",
      describeRoute({
        summary: "Semantic diff",
        description: "Compute semantic diff between two versions of a file.",
        operationId: "trellis.semantic.diff",
        responses: {
          200: {
            description: "Semantic patches",
            content: { "application/json": { schema: resolver(z.array(z.any())) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ old: z.string(), new: z.string(), path: z.string() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = Trellis.semanticDiff(body.old, body.new, body.path, q.directory)
        return c.json(result ?? [])
      },
    )
    .get(
      "/scaffold/context",
      describeRoute({
        summary: "Infer project context",
        description: "Detect language, framework, build tool, and test runner.",
        operationId: "trellis.scaffold.context",
        responses: {
          200: {
            description: "Project context",
            content: { "application/json": { schema: resolver(Trellis.ProjectContextSchema) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        const s = Trellis.scaffold(q.directory)
        const ctx = s.context()
        return c.json(ctx)
      },
    )
    .get(
      "/scaffold/profile",
      describeRoute({
        summary: "Load user profile",
        description: "Load the trellis user profile for the workspace.",
        operationId: "trellis.scaffold.profile",
        responses: {
          200: {
            description: "User profile",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        const s = Trellis.scaffold(q.directory)
        const profile = s.profile()
        return c.json(profile ?? {})
      },
    )
    .post(
      "/scaffold/profile",
      describeRoute({
        summary: "Save user profile",
        description: "Save or update the trellis user profile.",
        operationId: "trellis.scaffold.profile.save",
        responses: {
          200: {
            description: "Saved profile",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({}).passthrough()),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const s = Trellis.scaffold(q.directory)
        s.saveProfile(body)
        return c.json({ success: true })
      },
    )
    // -----------------------------------------------------------------------
    // Phase 3 — Kernel-level endpoints
    // -----------------------------------------------------------------------
    .get(
      "/time-travel/:hash",
      describeRoute({
        summary: "Time travel to op",
        description: "Get a snapshot of the graph state at a specific op hash.",
        operationId: "trellis.timeTravel",
        responses: {
          200: {
            description: "Time travel snapshot",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const hash = decodeURIComponent(c.req.param("hash"))
        const q = c.req.valid("query")
        const result = Trellis.timeTravel(hash, q.directory)
        if (!result) return c.json({ error: "Op not found" }, 404)
        return c.json(result)
      },
    )
    .get(
      "/query",
      describeRoute({
        summary: "Query graph",
        description: "Query EAV facts by entity, attribute, and/or value pattern.",
        operationId: "trellis.query",
        responses: {
          200: {
            description: "Matching facts",
            content: { "application/json": { schema: resolver(Trellis.Fact.array()) } },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          entity: z.string().optional(),
          attribute: z.string().optional(),
          value: z.string().optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.queryGraph({ entity: q.entity, attribute: q.attribute, value: q.value }, q.directory))
      },
    )
    .get(
      "/ontologies",
      describeRoute({
        summary: "List ontologies",
        description: "List all entity types and their counts in the graph.",
        operationId: "trellis.ontologies",
        responses: {
          200: {
            description: "Ontology list",
            content: {
              "application/json": {
                schema: resolver(z.array(z.object({ type: z.string(), count: z.number() }))),
              },
            },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.listOntologies(q.directory))
      },
    )
    .get(
      "/workspace/config",
      describeRoute({
        summary: "Get workspace config",
        description: "Get the full workspace configuration: branch, ops, store stats, telos, ontologies.",
        operationId: "trellis.workspace.config",
        responses: {
          200: {
            description: "Workspace config",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        const result = Trellis.workspaceConfig(q.directory)
        if (!result) return c.json({ error: "Workspace not available" }, 404)
        return c.json(result)
      },
    )
    .get(
      "/files",
      describeRoute({
        summary: "List trellis tracked files",
        description: "List all files tracked by TrellisVCS.",
        operationId: "trellis.files",
        responses: {
          200: {
            description: "Tracked files",
            content: {
              "application/json": {
                schema: resolver(Trellis.TrackedFile.array()),
              },
            },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.files(q.directory))
      },
    )
    .get(
      "/ops",
      describeRoute({
        summary: "Get trellis op history",
        description: "Get recent operations from the causal stream.",
        operationId: "trellis.ops",
        responses: {
          200: {
            description: "Operation history",
            content: {
              "application/json": {
                schema: resolver(
                  z
                    .array(
                      z.object({
                        kind: z.string(),
                        timestamp: z.string(),
                        hash: z.string(),
                        filePath: z.string().optional(),
                        branchName: z.string().optional(),
                        milestoneMessage: z.string().optional(),
                        toolName: z.string().optional(),
                        outputSummary: z.string().optional(),
                        storeEntities: z.array(z.string()).optional(),
                        storeAttrs: z.array(z.string()).optional(),
                      }),
                    )
                    .meta({ ref: "TrellisOps" }),
                ),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(500).optional(),
          file: z.string().optional(),
          entity: z.string().optional(),
        }),
      ),
      async (c) => {
        const opts = c.req.valid("query")
        return c.json(
          Trellis.ops(opts.directory, { limit: opts.limit, file: opts.file, entity: opts.entity }),
        )
      },
    )
    .get(
      "/decisions",
      describeRoute({
        summary: "List decision traces",
        description: "Query recorded decision traces from agent tool calls.",
        operationId: "trellis.decisions",
        responses: {
          200: {
            description: "Decision traces",
            content: {
              "application/json": {
                schema: resolver(z.array(z.any()).meta({ ref: "TrellisDecisions" })),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          tool: z.string().optional(),
          agent: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.decisions(q.directory, { tool: q.tool, agent: q.agent, limit: q.limit }))
      },
    )
    .get(
      "/decisions/chain/:entity",
      describeRoute({
        summary: "Get decision chain for entity",
        description: "Get all decisions that affected a given entity (e.g. issue:TRL-5).",
        operationId: "trellis.decisions.chain",
        responses: {
          200: {
            description: "Decision chain",
            content: {
              "application/json": {
                schema: resolver(z.array(z.any()).meta({ ref: "TrellisDecisionChain" })),
              },
            },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.chain(c.req.param("entity"), q.directory))
      },
    )
    // -----------------------------------------------------------------------
    // Branches
    // -----------------------------------------------------------------------
    .get(
      "/branches",
      describeRoute({
        summary: "List branches",
        description: "List all TrellisVCS branches.",
        operationId: "trellis.branches",
        responses: {
          200: {
            description: "Branch list",
            content: { "application/json": { schema: resolver(Trellis.Branch.array()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.branches(q.directory))
      },
    )
    .post(
      "/branches",
      describeRoute({
        summary: "Create branch",
        description: "Create a new branch forked from the current branch.",
        operationId: "trellis.branches.create",
        responses: {
          200: {
            description: "Created branch op",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ name: z.string() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.createBranch(body.name, q.directory)
        if (!result) return c.json({ error: `Failed to create branch ${body.name}` }, 500)
        return c.json(result)
      },
    )
    .post(
      "/branches/switch",
      describeRoute({
        summary: "Switch branch",
        description: "Switch to an existing branch.",
        operationId: "trellis.branches.switch",
        responses: {
          200: {
            description: "Switch result",
            content: {
              "application/json": { schema: resolver(z.object({ success: z.boolean(), branch: z.string() })) },
            },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ name: z.string() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = Trellis.switchBranch(body.name, q.directory)
        if (!result) return c.json({ error: `Failed to switch to branch ${body.name}` }, 500)
        return c.json(result)
      },
    )
    .delete(
      "/branches/:name",
      describeRoute({
        summary: "Delete branch",
        description: "Delete a branch by name.",
        operationId: "trellis.branches.delete",
        responses: {
          200: {
            description: "Deleted branch op",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const name = c.req.param("name")
        const q = c.req.valid("query")
        const result = await Trellis.deleteBranch(name, q.directory)
        if (!result) return c.json({ error: `Failed to delete branch ${name}` }, 500)
        return c.json(result)
      },
    )
    // -----------------------------------------------------------------------
    // Milestones
    // -----------------------------------------------------------------------
    .get(
      "/milestones",
      describeRoute({
        summary: "List milestones",
        description: "List all TrellisVCS milestones.",
        operationId: "trellis.milestones",
        responses: {
          200: {
            description: "Milestone list",
            content: { "application/json": { schema: resolver(Trellis.Milestone.array()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.milestones(q.directory))
      },
    )
    .post(
      "/milestones",
      describeRoute({
        summary: "Create milestone",
        description: "Create a narrative milestone spanning recent ops.",
        operationId: "trellis.milestones.create",
        responses: {
          200: {
            description: "Created milestone op",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ message: z.string(), dueAt: z.string().optional() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.milestone(body.message, { dueAt: body.dueAt }, q.directory)
        if (!result) return c.json({ error: "Failed to create milestone" }, 500)
        return c.json(result)
      },
    )
    // -----------------------------------------------------------------------
    // Idea Garden
    // -----------------------------------------------------------------------
    .get(
      "/garden",
      describeRoute({
        summary: "List garden clusters",
        description: "List idea clusters (abandoned work) from the Idea Garden.",
        operationId: "trellis.garden.list",
        responses: {
          200: {
            description: "Garden clusters",
            content: { "application/json": { schema: resolver(Trellis.GardenCluster.array()) } },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          status: z.string().optional(),
          keyword: z.string().optional(),
          file: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.gardenList(q.directory, q))
      },
    )
    .get(
      "/garden/stats",
      describeRoute({
        summary: "Garden statistics",
        description: "Get summary statistics for the Idea Garden.",
        operationId: "trellis.garden.stats",
        responses: {
          200: {
            description: "Garden stats",
            content: { "application/json": { schema: resolver(Trellis.GardenStats) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        const result = Trellis.gardenStats(q.directory)
        if (!result) return c.json({ error: "Garden not available" }, 500)
        return c.json(result)
      },
    )
    .post(
      "/garden/:id/revive",
      describeRoute({
        summary: "Revive garden cluster",
        description: "Revive an abandoned idea cluster into the active stream.",
        operationId: "trellis.garden.revive",
        responses: {
          200: {
            description: "Revive result",
            content: {
              "application/json": { schema: resolver(z.object({ success: z.boolean(), opCount: z.number() })) },
            },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const result = Trellis.gardenRevive(id, q.directory)
        if (!result) return c.json({ error: `Failed to revive cluster ${id}` }, 500)
        return c.json(result)
      },
    )
    // -----------------------------------------------------------------------
    // Eval
    // -----------------------------------------------------------------------
    .get(
      "/eval/summary",
      describeRoute({
        summary: "Eval workspace summary",
        description: "Get workspace-wide eval scores: decision quality, issue health, session efficiency.",
        operationId: "trellis.eval.summary",
        responses: {
          200: {
            description: "Eval summary",
            content: { "application/json": { schema: resolver(Trellis.EvalSummarySchema) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        const result = Trellis.evalSummary(q.directory)
        if (!result) return c.json({ error: "Eval not available" }, 500)
        return c.json(result)
      },
    )
    .get(
      "/eval/agent/:id",
      describeRoute({
        summary: "Per-agent eval report",
        description: "Get eval scores for a specific agent.",
        operationId: "trellis.eval.agent",
        responses: {
          200: {
            description: "Agent report",
            content: { "application/json": { schema: resolver(Trellis.AgentReportSchema) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const result = Trellis.evalAgent(id, q.directory)
        if (!result) return c.json({ error: `Agent ${id} eval not available` }, 500)
        return c.json(result)
      },
    )
    .get(
      "/eval/session/:id",
      describeRoute({
        summary: "Per-session eval report",
        description: "Get eval scores for a specific session.",
        operationId: "trellis.eval.session",
        responses: {
          200: {
            description: "Session report",
            content: { "application/json": { schema: resolver(Trellis.SessionReportSchema) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const result = Trellis.evalSession(id, q.directory)
        if (!result) return c.json({ error: `Session ${id} eval not available` }, 500)
        return c.json(result)
      },
    )
    .get(
      "/eval/issue/:id",
      describeRoute({
        summary: "Per-issue health score",
        description: "Get health score for a specific issue.",
        operationId: "trellis.eval.issue",
        responses: {
          200: {
            description: "Issue score",
            content: { "application/json": { schema: resolver(Trellis.IssueScoreSchema) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const result = Trellis.evalIssue(id, q.directory)
        if (!result) return c.json({ error: `Issue ${id} eval not available` }, 404)
        return c.json(result)
      },
    )
    .get(
      "/backlinks/:entity",
      describeRoute({
        summary: "Get backlinks for an entity",
        description: "Get all wiki-link references pointing to a given entity.",
        operationId: "trellis.backlinks",
        responses: {
          200: {
            description: "List of backlinks",
            content: { "application/json": { schema: resolver(Trellis.Backlink.array()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const entity = decodeURIComponent(c.req.param("entity"))
        const q = c.req.valid("query")
        return c.json(Trellis.backlinks(entity, q.directory))
      },
    )
    .get(
      "/graph",
      describeRoute({
        summary: "Get entity graph data",
        description: "Get nodes and edges for force-directed graph visualization.",
        operationId: "trellis.graph",
        responses: {
          200: {
            description: "Graph nodes and edges",
            content: {
              "application/json": {
                schema: resolver(Trellis.GraphData),
              },
            },
          },
        },
      }),
      validator(
        "query",
        dirQuery.extend({
          includeHidden: z.union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")]).optional(),
          includeImports: z.union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")]).optional(),
          includeLinks: z.union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")]).optional(),
          includeOps: z.union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")]).optional(),
          opsLimit: z.coerce.number().int().min(1).max(500).optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const includeHidden = q.includeHidden === "true" || q.includeHidden === "1"
        const includeImports = q.includeImports !== "false" && q.includeImports !== "0"
        const includeLinks = q.includeLinks !== "false" && q.includeLinks !== "0"
        const includeOps = q.includeOps === "true" || q.includeOps === "1"
        const base = Trellis.graph(q.directory, {
          includeHidden,
          includeImports,
          includeLinks,
          includeOps,
          opsLimit: q.opsLimit,
        })

        // Merge MCP server nodes (TRL-23)
        try {
          const mcpStatus = await MCP.status()
          for (const [name, status] of Object.entries(mcpStatus)) {
            const id = `mcp:${name}`
            base.nodes.push({ id, label: name, type: "mcp", status: status.status })
          }
        } catch {}

        return c.json(base)
      },
    )
    .post(
      "/sprites",
      describeRoute({
        summary: "Create a sprite entity",
        description: "Create a sprite deployment target as a trellis entity.",
        operationId: "trellis.sprites.create",
        responses: {
          200: {
            description: "Sprite created",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ name: z.string(), url: z.string().optional(), description: z.string().optional() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const op = await Trellis.createSprite(body.name, { url: body.url, description: body.description }, q.directory)
        return c.json({ success: !!op })
      },
    )
    .delete(
      "/sprites/:name",
      describeRoute({
        summary: "Delete a sprite entity",
        description: "Delete a sprite deployment target by name.",
        operationId: "trellis.sprites.delete",
        responses: {
          200: {
            description: "Sprite deleted",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const name = c.req.param("name")
        const q = c.req.valid("query")
        const result = await Trellis.deleteSprite(name, q.directory)
        return c.json({ success: result })
      },
    )
    .get(
      "/refs/:entity",
      describeRoute({
        summary: "Get bidirectional references for an entity",
        description: "Get outgoing (resolved) refs from an entity's content and incoming backlinks.",
        operationId: "trellis.refs",
        responses: {
          200: {
            description: "Outgoing and incoming references",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    outgoing: Trellis.ResolvedRef.array(),
                    incoming: Trellis.Backlink.array(),
                  }),
                ),
              },
            },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const entity = decodeURIComponent(c.req.param("entity"))
        const q = c.req.valid("query")
        return c.json({
          outgoing: Trellis.outgoingRefs(entity, q.directory),
          incoming: Trellis.backlinks(entity, q.directory),
        })
      },
    )
    // -----------------------------------------------------------------------
    // EAV Store — Database tab endpoints
    // -----------------------------------------------------------------------
    .get(
      "/store/stats",
      describeRoute({
        summary: "EAV store statistics",
        description: "Get fact/link/entity/attribute counts from the EAV store.",
        operationId: "trellis.store.stats",
        responses: {
          200: {
            description: "Store stats",
            content: { "application/json": { schema: resolver(Trellis.StoreStats) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        if (!(await ensure(q.directory))) {
          return c.json({
            totalFacts: 0,
            totalLinks: 0,
            uniqueEntities: 0,
            uniqueAttributes: 0,
            catalogEntries: 0,
          })
        }
        const result = Trellis.storeStats(q.directory)
        if (!result) {
          return c.json({
            totalFacts: 0,
            totalLinks: 0,
            uniqueEntities: 0,
            uniqueAttributes: 0,
            catalogEntries: 0,
          })
        }
        return c.json(result)
      },
    )
    .get(
      "/store/catalog",
      describeRoute({
        summary: "Attribute catalog",
        description: "Get all attributes with type, cardinality, distinct count, and examples.",
        operationId: "trellis.store.catalog",
        responses: {
          200: {
            description: "Catalog entries",
            content: { "application/json": { schema: resolver(Trellis.CatalogEntrySchema.array()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        if (!(await ensure(q.directory))) return c.json([])
        try {
          return c.json(Trellis.storeCatalog(q.directory))
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[trellis] store catalog failed dir=${q.directory ?? "<default>"} error=${msg}`)
          return c.json({ error: "Catalog failed", reason: msg }, 500)
        }
      },
    )
    .get(
      "/store/entities",
      describeRoute({
        summary: "List entities",
        description: "List unique entity IDs, optionally filtered by type.",
        operationId: "trellis.store.entities",
        responses: {
          200: {
            description: "Entity list",
            content: {
              "application/json": {
                schema: resolver(z.array(z.object({ id: z.string(), type: z.string(), label: z.string().optional() }))),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          type: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(1000).optional(),
          offset: z.coerce.number().int().min(0).optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        if (!(await ensure(q.directory))) return c.json([])
        return c.json(Trellis.storeEntities(q.directory, { type: q.type, limit: q.limit, offset: q.offset }))
      },
    )
    .get(
      "/store/entity/:id",
      describeRoute({
        summary: "Get entity details",
        description: "Get all facts and links for a specific entity.",
        operationId: "trellis.store.entity",
        responses: {
          200: {
            description: "Entity facts and links",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    id: z.string(),
                    facts: Trellis.Fact.array(),
                    links: Trellis.LinkSchema.array(),
                  }),
                ),
              },
            },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = decodeURIComponent(c.req.param("id"))
        const q = c.req.valid("query")
        if (!(await ensure(q.directory))) return c.json({ error: `Entity ${id} not found` }, 404)
        const result = Trellis.storeEntity(id, q.directory)
        if (!result) return c.json({ error: `Entity ${id} not found` }, 404)
        return c.json(result)
      },
    )
    .get(
      "/store/facts",
      describeRoute({
        summary: "Query facts",
        description: "Query facts by attribute and/or value.",
        operationId: "trellis.store.facts",
        responses: {
          200: {
            description: "Matching facts",
            content: { "application/json": { schema: resolver(Trellis.Fact.array()) } },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          attribute: z.string().optional(),
          value: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(100000).optional(),
          offset: z.coerce.number().int().min(0).optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        if (!(await ensure(q.directory))) return c.json([])
        return c.json(
          Trellis.storeFacts(q.directory, {
            attribute: q.attribute,
            value: q.value,
            limit: q.limit,
            offset: q.offset,
          }),
        )
      },
    )
    .get(
      "/store/links",
      describeRoute({
        summary: "Query links",
        description: "Query links by entity and/or attribute.",
        operationId: "trellis.store.links",
        responses: {
          200: {
            description: "Matching links",
            content: { "application/json": { schema: resolver(Trellis.LinkSchema.array()) } },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional(),
          entity: z.string().optional(),
          attribute: z.string().optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        if (!(await ensure(q.directory))) return c.json([])
        return c.json(Trellis.storeLinks(q.directory, { entity: q.entity, attribute: q.attribute }))
      },
    )
    .post(
      "/import/csv",
      describeRoute({
        summary: "Import CSV into CMS collection",
        description: "Batch import CSV rows into a CMS collection, extending the collection schema for new columns.",
        operationId: "trellis.import.csv",
        responses: {
          200: {
            description: "Import result",
            content: { "application/json": { schema: resolver(CsvImportResult) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", CsvImportBody),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        if (!(await ensure(q.directory))) return c.json(initErrorBody(q.directory), 503)
        try {
          return c.json(
            importCsv({
              ...body,
              dir: q.directory,
              meta: {
                actor: "user:local",
                actorKind: "user",
                source: "csv-import-ui",
                reason: "csv import",
              },
            }),
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[trellis] csv import failed dir=${q.directory ?? "<default>"} error=${msg}`)
          return c.json({ error: "CSV import failed", reason: msg }, 400)
        }
      },
    )
    .post(
      "/store/assert",
      describeRoute({
        summary: "Assert facts",
        description: "Add facts to the EAV store.",
        operationId: "trellis.store.assert",
        responses: {
          200: {
            description: "Assert result",
            content: { "application/json": { schema: resolver(z.object({ added: z.number() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", factBody),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        if (!(await ensure(q.directory))) return c.json(initErrorBody(q.directory), 503)
        try {
          const result = Trellis.storeAssert(body.facts, q.directory, body.meta)
          if (!result) return c.json(initErrorBody(q.directory), 503)
          SemanticLinks.syncCmsEntriesFromFacts(body.facts, q.directory ?? "", {
            ...(body.meta ?? {}),
            reason: body.meta?.reason ?? "cms rich_text semantic link sync",
          })
          return c.json(result)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[trellis] store assert failed dir=${q.directory ?? "<default>"} error=${msg}`)
          return c.json({ error: "Assert failed", reason: msg }, 500)
        }
      },
    )
    .post(
      "/store/retract",
      describeRoute({
        summary: "Retract facts",
        description: "Remove facts from the EAV store.",
        operationId: "trellis.store.retract",
        responses: {
          200: {
            description: "Retract result",
            content: { "application/json": { schema: resolver(z.object({ removed: z.number() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", factBody),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        if (!(await ensure(q.directory))) return c.json({ error: "Store not available" }, 500)
        const result = Trellis.storeRetract(body.facts, q.directory, body.meta)
        if (!result) return c.json({ error: "Store not available" }, 500)
        SemanticLinks.syncCmsEntriesFromFacts(body.facts, q.directory ?? "", {
          ...(body.meta ?? {}),
          reason: body.meta?.reason ?? "cms rich_text semantic link reconcile",
        })
        return c.json(result)
      },
    )
    .post(
      "/store/link",
      describeRoute({
        summary: "Add links",
        description: "Add links between entities in the EAV store.",
        operationId: "trellis.store.link",
        responses: {
          200: {
            description: "Link result",
            content: { "application/json": { schema: resolver(z.object({ added: z.number() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", linkBody),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        if (!(await ensure(q.directory))) return c.json({ error: "Store not available" }, 500)
        const result = Trellis.storeLink(body.links, q.directory, body.meta)
        if (!result) return c.json({ error: "Store not available" }, 500)
        return c.json(result)
      },
    )
    .post(
      "/store/unlink",
      describeRoute({
        summary: "Remove links",
        description: "Remove links between entities in the EAV store.",
        operationId: "trellis.store.unlink",
        responses: {
          200: {
            description: "Unlink result",
            content: { "application/json": { schema: resolver(z.object({ removed: z.number() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", linkBody),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        if (!(await ensure(q.directory))) return c.json({ error: "Store not available" }, 500)
        const result = Trellis.storeUnlink(body.links, q.directory, body.meta)
        if (!result) return c.json({ error: "Store not available" }, 500)
        return c.json(result)
      },
    )
    .post(
      "/brand/apply-template",
      describeRoute({
        summary: "Apply cloud brand template",
        description: "Materialize a brand template into the project store and refresh the brand snapshot.",
        operationId: "trellis.brand.applyTemplate",
        responses: {
          200: {
            description: "Applied brand snapshot",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          template: z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().optional(),
            version: z.number().int().min(1),
            spec: z.object({}).passthrough(),
          }),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        if (!(await ensure(q.directory))) return c.json(initErrorBody(q.directory), 503)
        const snapshot = ProjectBrand.applyCloudTemplate(body.template as Parameters<typeof ProjectBrand.applyCloudTemplate>[0], q.directory)
        if (!snapshot) return c.json({ error: "Failed to apply brand template" }, 500)
        return c.json(snapshot)
      },
    )
    .get(
      "/brand/templates",
      describeRoute({
        summary: "List built-in brand template presets",
        operationId: "trellis.brand.templates",
        responses: {
          200: {
            description: "Template presets",
            content: { "application/json": { schema: resolver(z.array(z.any())) } },
          },
        },
      }),
      async (c) => {
        const { BRAND_TEMPLATE_PRESETS } = await import("../../trellis/brand-template-presets")
        return c.json(BRAND_TEMPLATE_PRESETS)
      },
    )
    .get(
      "/brand",
      describeRoute({
        summary: "Get resolved project brand",
        operationId: "trellis.brand.get",
        responses: {
          200: {
            description: "Brand snapshot",
            content: { "application/json": { schema: resolver(z.any().nullable()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        if (!(await ensure(q.directory))) return c.json(null)
        return c.json(ProjectBrand.getResolved(q.directory) ?? null)
      },
    )
    .post(
      "/notes/save",
      describeRoute({
        summary: "Save note",
        description: "Create or update a note with proper entity patch semantics.",
        operationId: "trellis.notes.save",
        responses: {
          200: {
            description: "Saved note",
            content: { "application/json": { schema: resolver(z.object({ id: z.string(), title: z.string() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          id: z.string(),
          content: z.string(),
          tags: z.array(z.string()).optional().nullable(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        if (!(await ensure(q.directory))) return c.json(initErrorBody(q.directory), 503)
        try {
          const saved = Note.save(
            { id: body.id, content: body.content, tags: body.tags ?? undefined },
            q.directory,
          )
          if (!saved) return c.json({ error: "Failed to save note", reason: "store unavailable" }, 500)
          return c.json(saved)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[trellis] notes save failed dir=${q.directory ?? "<default>"} error=${msg}`)
          return c.json({ error: "Failed to save note", reason: msg }, 500)
        }
      },
    )
    .get(
      "/calendar/events",
      describeRoute({
        summary: "List calendar events",
        operationId: "trellis.calendar.list",
        responses: {
          200: {
            description: "Calendar events",
            content: { "application/json": { schema: resolver(z.array(z.any())) } },
          },
        },
      }),
      validator("query", dirQuery.extend({ year: z.coerce.number().optional(), month: z.coerce.number().optional() })),
      async (c) => {
        const q = c.req.valid("query")
        if (!(await ensure(q.directory))) return c.json(initErrorBody(q.directory), 503)
        const items =
          q.year !== undefined && q.month !== undefined
            ? CalendarEvent.listInMonth(q.year, q.month - 1, q.directory)
            : CalendarEvent.list({ limit: 500 }, q.directory)
        return c.json(items)
      },
    )
    .post(
      "/calendar/save",
      describeRoute({
        summary: "Save calendar event",
        operationId: "trellis.calendar.save",
        responses: {
          200: {
            description: "Saved event",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          id: z.string(),
          title: z.string().optional(),
          startAt: z.string().optional(),
          endAt: z.string().optional().nullable(),
          allDay: z.boolean().optional(),
          description: z.string().optional().nullable(),
          color: z.string().optional().nullable(),
          eventType: z.string().optional().nullable(),
          recurrence: z.string().optional().nullable(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        if (!(await ensure(q.directory))) return c.json(initErrorBody(q.directory), 503)
        try {
          const saved = CalendarEvent.save(
            {
              id: body.id,
              title: body.title,
              startAt: body.startAt,
              endAt: body.endAt ?? undefined,
              allDay: body.allDay,
              description: body.description ?? undefined,
              color: body.color ? (body.color as CalendarEventColor) : undefined,
              eventType: body.eventType ? (body.eventType as CalendarEventType) : undefined,
              recurrence: body.recurrence ?? undefined,
            },
            q.directory,
          )
          if (!saved) return c.json({ error: "Failed to save event", reason: "store unavailable" }, 500)
          return c.json(saved)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return c.json({ error: "Failed to save event", reason: msg }, 500)
        }
      },
    )
    .post(
      "/calendar/delete",
      describeRoute({
        summary: "Delete calendar event",
        operationId: "trellis.calendar.delete",
        responses: {
          200: {
            description: "Delete result",
            content: {
              "application/json": {
                schema: resolver(z.object({ retracted: z.number(), unlinked: z.number() })),
              },
            },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ id: z.string() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        if (!(await ensure(q.directory))) return c.json(initErrorBody(q.directory), 503)
        try {
          const removed = CalendarEvent.remove(body.id, q.directory)
          if (!removed) return c.json({ error: "Event not found" }, 404)
          return c.json(removed)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return c.json({ error: "Failed to delete event", reason: msg }, 500)
        }
      },
    )
    .post(
      "/notes/delete",
      describeRoute({
        summary: "Delete note",
        description: "Delete a note entity and its links.",
        operationId: "trellis.notes.delete",
        responses: {
          200: {
            description: "Delete result",
            content: {
              "application/json": {
                schema: resolver(z.object({ retracted: z.number(), unlinked: z.number() })),
              },
            },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ id: z.string() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        if (!(await ensure(q.directory))) return c.json(initErrorBody(q.directory), 503)
        try {
          const removed = Note.remove(body.id, q.directory)
          if (!removed) return c.json({ error: "Note not found" }, 404)
          return c.json(removed)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[trellis] notes delete failed dir=${q.directory ?? "<default>"} error=${msg}`)
          return c.json({ error: "Failed to delete note", reason: msg }, 500)
        }
      },
    )
    .get(
      "/dogfood",
      describeRoute({
        summary: "Dogfood mode status",
        description: "Get dogfood mode status and thresholds.",
        operationId: "trellis.dogfood",
        responses: {
          200: {
            description: "Dogfood status",
            content: { "application/json": { schema: resolver(Trellis.DogfoodSchema) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        return c.json(Trellis.dogfood())
      },
    )
    .post(
      "/dogfood/run",
      describeRoute({
        summary: "Trigger dogfood eval cycle",
        description: "Manually trigger a dogfood eval cycle.",
        operationId: "trellis.dogfood.run",
        responses: {
          200: {
            description: "Dogfood eval result",
            content: { "application/json": { schema: resolver(Trellis.DogfoodSchema) } },
          },
          409: { description: "Dogfood mode not active" },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const result = await Trellis.dogfoodRun()
        if (!result) return c.json({ error: "Dogfood mode not active" }, 409)
        return c.json(result)
      },
    )
    // ---------------------------------------------------------------------------
    // Plan-Approval routes (Phase 4)
    // ---------------------------------------------------------------------------
    .get(
      "/plans",
      describeRoute({
        summary: "List plans",
        description: "List all plans, optionally filtered by status.",
        operationId: "trellis.plans",
        responses: {
          200: {
            description: "Plan list",
            content: { "application/json": { schema: resolver(Trellis.PlanSchema.array()) } },
          },
        },
      }),
      validator("query", z.object({ directory: z.string().optional(), status: z.string().optional() })),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.listPlans(q.status, q.directory))
      },
    )
    .get(
      "/plans/pending",
      describeRoute({
        summary: "Get pending plan",
        description: "Get the currently active/pending plan if one exists.",
        operationId: "trellis.plans.pending",
        responses: {
          200: {
            description: "Pending plan",
            content: { "application/json": { schema: resolver(Trellis.PlanSchema.nullable()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.pendingPlan(q.directory) ?? null)
      },
    )
    .get(
      "/plans/mode",
      describeRoute({
        summary: "Check plan mode",
        description: "Check if plan mode is currently active.",
        operationId: "trellis.plans.mode",
        responses: {
          200: {
            description: "Plan mode status",
            content: { "application/json": { schema: resolver(z.object({ active: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json({ active: Trellis.isInPlanMode(q.directory) })
      },
    )
    .post(
      "/plans/enter",
      describeRoute({
        summary: "Enter plan mode",
        description: "Start a new plan. All subsequent operations are buffered.",
        operationId: "trellis.plans.enter",
        responses: {
          200: {
            description: "Plan created",
            content: { "application/json": { schema: resolver(z.object({ id: z.string(), title: z.string() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ title: z.string(), description: z.string().optional() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.enterPlanMode(body.title, body.description, q.directory)
        if (!result) return c.json({ error: "Plan mode not available" }, 500)
        return c.json(result)
      },
    )
    .post(
      "/plans/operation",
      describeRoute({
        summary: "Add plan operation",
        description: "Add a buffered operation to the active plan.",
        operationId: "trellis.plans.operation",
        responses: {
          200: {
            description: "Operation added",
            content: { "application/json": { schema: resolver(z.object({ id: z.string() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          kind: z.string(),
          entityId: z.string().optional(),
          entityType: z.string().optional(),
          description: z.string().optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.planOperation(body, q.directory)
        if (!result) return c.json({ error: "Not in plan mode" }, 409)
        return c.json(result)
      },
    )
    .post(
      "/plans/submit",
      describeRoute({
        summary: "Submit plan for review",
        description: "Submit the active plan for user approval.",
        operationId: "trellis.plans.submit",
        responses: {
          200: {
            description: "Submitted plan",
            content: { "application/json": { schema: resolver(Trellis.PlanSchema) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        const result = await Trellis.submitPlan(q.directory)
        if (!result) return c.json({ error: "No plan to submit" }, 409)
        return c.json(result)
      },
    )
    .post(
      "/plans/approve",
      describeRoute({
        summary: "Approve plan",
        description: "Approve a submitted plan. Replays all buffered operations.",
        operationId: "trellis.plans.approve",
        responses: {
          200: {
            description: "Approval result",
            content: { "application/json": { schema: resolver(z.any()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        const result = await Trellis.approvePlan(q.directory)
        if (!result) return c.json({ error: "No plan to approve" }, 409)
        return c.json(result)
      },
    )
    .post(
      "/plans/reject",
      describeRoute({
        summary: "Reject plan",
        description: "Reject a submitted plan with optional reason.",
        operationId: "trellis.plans.reject",
        responses: {
          200: {
            description: "Rejection result",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ reason: z.string().optional() }).optional()),
      async (c) => {
        const q = c.req.valid("query")
        const body = await c.req.json().catch(() => ({}))
        const result = await Trellis.rejectPlan(body?.reason, q.directory)
        if (!result) return c.json({ error: "No plan to reject" }, 409)
        return c.json(result)
      },
    )
    .post(
      "/plans/cancel",
      describeRoute({
        summary: "Cancel plan",
        description: "Cancel the active plan without submitting.",
        operationId: "trellis.plans.cancel",
        responses: {
          200: {
            description: "Cancel result",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        const result = await Trellis.cancelPlan(q.directory)
        if (!result) return c.json({ error: "No plan to cancel" }, 409)
        return c.json(result)
      },
    )
    // ---------------------------------------------------------------------------
    // Proactive Watcher routes (Phase 5)
    // ---------------------------------------------------------------------------
    .get(
      "/watcher/rules",
      describeRoute({
        summary: "List watcher rules",
        description: "List all active proactive watcher rules.",
        operationId: "trellis.watcher.rules",
        responses: {
          200: {
            description: "Rules",
            content: { "application/json": { schema: resolver(Trellis.WatcherRuleSchema.array()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.watcherRules(q.directory))
      },
    )
    .get(
      "/watcher/suggestions",
      describeRoute({
        summary: "Get suggestions",
        description: "Get pending proactive suggestions.",
        operationId: "trellis.watcher.suggestions",
        responses: {
          200: {
            description: "Suggestions",
            content: { "application/json": { schema: resolver(Trellis.SuggestionSchema.array()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.watcherSuggestions(q.directory))
      },
    )
    .post(
      "/watcher/suggestions/:id/dismiss",
      describeRoute({
        summary: "Dismiss suggestion",
        description: "Dismiss a proactive suggestion.",
        operationId: "trellis.watcher.suggestions.dismiss",
        responses: {
          200: {
            description: "Dismiss result",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        return c.json({ success: Trellis.dismissSuggestion(id, q.directory) })
      },
    )
    .post(
      "/watcher/rules",
      describeRoute({
        summary: "Add watcher rule",
        description: "Add a custom heuristic rule.",
        operationId: "trellis.watcher.rules.add",
        responses: {
          200: {
            description: "Add result",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ id: z.string(), description: z.string() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        return c.json({ success: Trellis.addWatcherRule(body, q.directory) })
      },
    )
    .delete(
      "/watcher/rules/:id",
      describeRoute({
        summary: "Remove watcher rule",
        description: "Remove a watcher rule by ID.",
        operationId: "trellis.watcher.rules.remove",
        responses: {
          200: {
            description: "Remove result",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        return c.json({ success: Trellis.removeWatcherRule(id, q.directory) })
      },
    )
    // ---------------------------------------------------------------------------
    // Idea Garden (kernel-based) routes (Phase 6)
    // ---------------------------------------------------------------------------
    .get(
      "/garden/ideas",
      describeRoute({
        summary: "Harvest recoverable ideas",
        description: "Scan rejected plans, archived conversations, and unexplored alternatives.",
        operationId: "trellis.garden.ideas",
        responses: {
          200: {
            description: "Recoverable ideas",
            content: { "application/json": { schema: resolver(Trellis.RecoverableIdeaSchema.array()) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.harvestIdeas(q.directory))
      },
    )
    .post(
      "/garden/ideas/:id/resurrect",
      describeRoute({
        summary: "Resurrect idea",
        description: "Resurrect a rejected plan from the idea garden into a new active plan.",
        operationId: "trellis.garden.ideas.resurrect",
        responses: {
          200: {
            description: "Resurrected plan ID",
            content: { "application/json": { schema: resolver(z.object({ id: z.string() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const result = await Trellis.resurrectPlan(id, q.directory)
        if (!result) return c.json({ error: "Resurrect failed" }, 500)
        return c.json(result)
      },
    )
    // ---------------------------------------------------------------------------
    // Agent Memory routes (Phase 6)
    // ---------------------------------------------------------------------------
    .get(
      "/conversations",
      describeRoute({
        summary: "List conversations",
        description: "List graph-backed agent conversations.",
        operationId: "trellis.conversations",
        responses: {
          200: {
            description: "Conversations",
            content: { "application/json": { schema: resolver(Trellis.ConversationSchema.array()) } },
          },
        },
      }),
      validator("query", z.object({ directory: z.string().optional(), status: z.string().optional() })),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.listConversations(q.status, q.directory))
      },
    )
    .post(
      "/conversations",
      describeRoute({
        summary: "Create conversation",
        description: "Create a new graph-backed agent conversation.",
        operationId: "trellis.conversations.create",
        responses: {
          200: {
            description: "Created conversation",
            content: { "application/json": { schema: resolver(z.object({ id: z.string(), title: z.string() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      validator("json", z.object({ title: z.string(), agentId: z.string().optional(), model: z.string().optional() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.createConversation(body.title, body, q.directory)
        if (!result) return c.json({ error: "Failed to create conversation" }, 500)
        return c.json(result)
      },
    )
    .post(
      "/conversations/:id/resume",
      describeRoute({
        summary: "Resume conversation",
        description: "Resume an existing conversation by loading its messages from the graph.",
        operationId: "trellis.conversations.resume",
        responses: {
          200: {
            description: "Resume result",
            content: { "application/json": { schema: resolver(z.object({ id: z.string(), resumed: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const result = await Trellis.resumeConversation(id, q.directory)
        if (!result) return c.json({ error: "Resume failed" }, 500)
        return c.json(result)
      },
    )
    .get(
      "/conversations/history",
      describeRoute({
        summary: "Get conversation history",
        description: "Get messages from the active conversation.",
        operationId: "trellis.conversations.history",
        responses: {
          200: {
            description: "Message history",
            content: { "application/json": { schema: resolver(z.array(z.any())) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.conversationHistory(q.directory))
      },
    )
    .post(
      "/conversations/archive",
      describeRoute({
        summary: "Archive conversation",
        description: "Archive the active conversation.",
        operationId: "trellis.conversations.archive",
        responses: {
          200: {
            description: "Archive result",
            content: { "application/json": { schema: resolver(z.object({ success: z.boolean() })) } },
          },
        },
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        const result = await Trellis.archiveConversation(q.directory)
        return c.json({ success: result })
      },
    )
    // ---------------------------------------------------------------------------
    // WorkUnit routes
    // ---------------------------------------------------------------------------
    .get(
      "/workunits",
      describeRoute({ summary: "List work units", operationId: "trellis.workunits" }),
      validator("query", dirQuery),
      async (c) => {
        return c.json(Trellis.workUnits(c.req.valid("query").directory))
      },
    )
    .post(
      "/workunits",
      describeRoute({ summary: "Create work unit", operationId: "trellis.workunit.create" }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          title: z.string(),
          priority: z.enum(["critical", "high", "medium", "low"]).optional(),
          tags: z.array(z.string()).optional(),
          cycle: z.string().optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.createWorkUnit(body.title, body, q.directory)
        if (!result) return c.json({ error: "Failed to create work unit" }, 500)
        return c.json(result)
      },
    )
    .put(
      "/workunits/:id",
      describeRoute({ summary: "Update work unit", operationId: "trellis.workunit.update" }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          title: z.string().optional(),
          status: z.enum(["backlog", "in_progress", "done"]).optional(),
          priority: z.enum(["critical", "high", "medium", "low"]).optional(),
          tags: z.array(z.string()).optional(),
          cycle: z.string().optional().nullable(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const id = c.req.param("id")
        const body = c.req.valid("json")
        const result = await Trellis.updateWorkUnit(id, body, q.directory)
        if (!result) return c.json({ error: "Work unit not found" }, 404)
        return c.json(result)
      },
    )
    .delete(
      "/workunits/:id",
      describeRoute({ summary: "Delete work unit", operationId: "trellis.workunit.delete" }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        const id = c.req.param("id")
        const result = await Trellis.deleteWorkUnit(id, q.directory)
        return c.json({ success: result })
      },
    )
    // ---------------------------------------------------------------------------
    // Cycle routes
    // ---------------------------------------------------------------------------
    .get(
      "/cycles",
      describeRoute({ summary: "List cycles", operationId: "trellis.cycles" }),
      validator("query", dirQuery),
      async (c) => {
        return c.json(Trellis.cycles(c.req.valid("query").directory))
      },
    )
    .post(
      "/cycles",
      describeRoute({ summary: "Create cycle", operationId: "trellis.cycle.create" }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          title: z.string(),
          milestone: z.string().optional(),
          purpose: z.string().optional(),
          horizon: z.enum(["now", "next", "later"]).optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.createCycle(body.title, body, q.directory)
        if (!result) return c.json({ error: "Failed to create cycle" }, 500)
        return c.json(result)
      },
    )
    // ---------------------------------------------------------------------------
    // MilestoneEpic routes
    // ---------------------------------------------------------------------------
    .get(
      "/epics",
      describeRoute({ summary: "List epics", operationId: "trellis.epics" }),
      validator("query", dirQuery),
      async (c) => {
        return c.json(Trellis.epics(c.req.valid("query").directory))
      },
    )
    .post(
      "/epics",
      describeRoute({ summary: "Create epic", operationId: "trellis.epic.create" }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          title: z.string(),
          roadmap: z.string().optional(),
          targetDate: z.string().optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.createMilestoneEpic(body.title, body, q.directory)
        if (!result) return c.json({ error: "Failed to create epic" }, 500)
        return c.json(result)
      },
    )
    // ---------------------------------------------------------------------------
    // Roadmap routes
    // ---------------------------------------------------------------------------
    .get(
      "/roadmaps",
      describeRoute({ summary: "List roadmaps", operationId: "trellis.roadmaps" }),
      validator("query", dirQuery),
      async (c) => {
        return c.json(Trellis.roadmaps(c.req.valid("query").directory))
      },
    )
    .post(
      "/roadmaps",
      describeRoute({ summary: "Create roadmap", operationId: "trellis.roadmap.create" }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          title: z.string(),
          horizon: z.enum(["now", "next", "later"]).optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.createRoadmap(body.title, body, q.directory)
        if (!result) return c.json({ error: "Failed to create roadmap" }, 500)
        return c.json(result)
      },
    )
    // ---------------------------------------------------------------------------
    // Telos routes
    // ---------------------------------------------------------------------------
    .get(
      "/telos",
      describeRoute({ summary: "Get telos config", operationId: "trellis.telos" }),
      validator("query", dirQuery),
      async (c) => {
        return c.json(Trellis.getTelos(c.req.valid("query").directory))
      },
    )
    .post(
      "/telos",
      describeRoute({ summary: "Set telos config", operationId: "trellis.telos.set" }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          mission: z.string(),
          vision: z.string().optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.setTelos(body.mission, body.vision, q.directory)
        if (!result) return c.json({ error: "Failed to set telos" }, 500)
        return c.json(result)
      },
    )

    // ---------------------------------------------------------------------------
    // Desk affordances (Phase 2): lane status, presence, lane ops, usage rollup
    // ---------------------------------------------------------------------------
    .get(
      "/lane-status",
      describeRoute({
        summary: "Get lane status for a session",
        operationId: "trellis.lane.status",
      }),
      validator(
        "query",
        dirQuery.extend({ sessionID: z.string().optional() }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const status = Trellis.laneStatus(q.sessionID, q.directory)
        return c.json(status ?? { laneID: undefined })
      },
    )
    .get(
      "/presence",
      describeRoute({
        summary: "List live agent presence",
        operationId: "trellis.presence",
      }),
      validator("query", dirQuery),
      async (c) => {
        return c.json(Trellis.presence(c.req.valid("query").directory))
      },
    )
    .post(
      "/lane-promote",
      describeRoute({
        summary: "Promote a lane (AC-verified)",
        operationId: "trellis.lane.promote",
      }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          laneId: z.string(),
          message: z.string().optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.promoteLane(body.laneId, q.directory, { message: body.message })
        if (!result) return c.json({ promoted: false, error: "engine unavailable" }, 500)
        return c.json(result)
      },
    )
    .post(
      "/issues/:id/close",
      describeRoute({
        summary: "Close an issue — AC-gated; auto-promotes only after criteria pass and confirm",
        operationId: "trellis.issue.close",
      }),
      validator("query", dirQuery),
      validator("json", z.object({ confirm: z.boolean().optional() })),
      async (c) => {
        const id = c.req.param("id")
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const result = await Trellis.closeIssueGated(id, q.directory, { confirm: body.confirm })
        if (!result) return c.json({ closed: false, error: "engine unavailable" }, 500)
        return c.json(result)
      },
    )
    .post(
      "/milestones",
      describeRoute({
        summary: "Create a milestone",
        operationId: "trellis.milestone.create",
      }),
      validator("query", dirQuery),
      validator("json", z.object({ message: z.string() })),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const op = await Trellis.milestone(body.message, {}, q.directory)
        if (!op) return c.json({ error: "Failed to create milestone" }, 500)
        return c.json({ milestoneId: op.vcs.milestoneId })
      },
    )
    .get(
      "/garden",
      describeRoute({
        summary: "List idea garden clusters",
        operationId: "trellis.garden.list",
      }),
      validator("query", dirQuery),
      async (c) => {
        const q = c.req.valid("query")
        return c.json(Trellis.gardenList(q.directory) ?? [])
      },
    )
    .post(
      "/usage",
      describeRoute({
        summary: "Record a session LLM usage rollup (EAV)",
        operationId: "trellis.usage.record",
      }),
      validator("query", dirQuery),
      validator(
        "json",
        z.object({
          sessionId: z.string(),
          laneId: z.string().optional(),
          tokens: z.number(),
          inputTokens: z.number().optional(),
          outputTokens: z.number().optional(),
          cost: z.number().optional(),
          model: z.string().optional(),
        }),
      ),
      async (c) => {
        const q = c.req.valid("query")
        const body = c.req.valid("json")
        const ok = Trellis.recordUsage(body, q.directory)
        return c.json({ recorded: ok })
      },
    )
    .get(
      "/reentry-status",
      describeRoute({
        summary: "Re-entry status (whereami banner)",
        operationId: "trellis.reentry.status",
      }),
      validator("query", dirQuery),
      async (c) => {
        return c.json(Trellis.reentryStatus(c.req.valid("query").directory))
      },
    ),
)
