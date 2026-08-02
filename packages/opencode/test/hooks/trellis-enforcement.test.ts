import { describe, expect, test } from "bun:test"
import { TrellisEnforcement } from "../../src/hooks/trellis-enforcement"

describe("hooks.trellis-enforcement", () => {
  const sessionID = "sess-1"
  const userMessageID = "user-1"

  test("appends graph enrichment reminder after cms create_entry", () => {
    TrellisEnforcement.reset(sessionID)
    const output = {
      output: "Created entry org:abc",
      title: "Created org:abc",
      metadata: { ok: true, id: "org:abc", collection: "organizations" },
    }

    const result = TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        tool: "cms",
        args: { action: "create_entry", collection: "organizations" },
      },
      output,
    )

    expect(result.output).toContain("Graph enrichment")
    expect(result.output).toContain("organizations")
    expect(result.output).toContain("data-hook=\"trellis-enforcement\"")
    expect(result.hook?.kind).toBe("graph-enrichment")
    expect(result.hook?.phase).toBe("tool")
  })

  test("appends research reminder after websearch", () => {
    TrellisEnforcement.reset(sessionID)
    const output = { output: "Found 10 results" }

    const result = TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        tool: "websearch",
        args: { query: "YC W25 startups" },
      },
      output,
    )

    expect(result.output).toContain("Next steps in Trellis")
    expect(result.hook?.kind).toBe("research-capture")
  })

  test("turnEndNudge returns enrichment reminder when cms writes lack section", () => {
    TrellisEnforcement.reset(sessionID)
    TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        tool: "cms",
        args: { action: "create_entry", collection: "organizations" },
      },
      {
        output: "ok",
        title: "Created org:abc",
        metadata: { ok: true, id: "org:abc", collection: "organizations" },
      },
    )

    const nudge = TrellisEnforcement.turnEndNudge({
      sessionID,
      userMessageID,
      agent: "build",
      assistantText: "Added 5 organizations to the database.",
    })

    expect(nudge?.text).toContain("Graph enrichment")
    expect(nudge?.hook.kind).toBe("turn-end-enrichment")
    expect(nudge?.hook.phase).toBe("turn-end")
    expect(TrellisEnforcement.__state(sessionID)?.turnEndNudges).toBe(1)
  })

  test("turnEndNudge skips when assistant already included enrichment", () => {
    TrellisEnforcement.reset(sessionID)
    TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        tool: "cms",
        args: { action: "create_entry", collection: "organizations" },
      },
      {
        output: "ok",
        title: "Created org:abc",
        metadata: { ok: true, id: "org:abc", collection: "organizations" },
      },
    )

    const nudge = TrellisEnforcement.turnEndNudge({
      sessionID,
      userMessageID,
      agent: "build",
      assistantText: "Done.\n\n## Graph enrichment\n1. Add CEOs",
    })

    expect(nudge).toBeUndefined()
  })

  test("nudges memory remember after recall + fact-shaped calendar event the heuristic missed", () => {
    TrellisEnforcement.reset(sessionID)
    TrellisEnforcement.onToolAfter(
      { sessionID, userMessageID, tool: "memory", args: { action: "recall", query: "timezone" } },
      { output: 'No memories matched "timezone".' },
    )

    const result = TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        tool: "calendar",
        args: { action: "create", title: "DOB", startAt: "2026-10-23", allDay: true },
      },
      { output: "Created calendar event calendar_event:abc" },
    )

    expect(result.output).toContain("memory remember")
    expect(result.output).toContain("scope: user")
    expect(result.hook?.kind).toBe("memory-capture")
  })

  test("does not nudge for clean personal events owned by deterministic capture", () => {
    TrellisEnforcement.reset(sessionID)
    TrellisEnforcement.onToolAfter(
      { sessionID, userMessageID, tool: "memory", args: { action: "recall", query: "birthday" } },
      { output: 'No memories matched "birthday".' },
    )

    const result = TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        tool: "calendar",
        args: { action: "create", title: "Birthday", startAt: "2026-10-23", allDay: true },
      },
      { output: "Created calendar event calendar_event:abc" },
    )

    expect(result.output).toBe("Created calendar event calendar_event:abc")
    expect(result.hook).toBeUndefined()
  })

  test("does not nudge a calendar create without a prior memory recall", () => {
    TrellisEnforcement.reset(sessionID)
    const result = TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        tool: "calendar",
        args: { action: "create", title: "DOB", startAt: "2026-10-23", allDay: true },
      },
      { output: "ok" },
    )

    expect(result.output).toBe("ok")
    expect(result.hook).toBeUndefined()
  })

  test("does not nudge when the model already remembered this turn", () => {
    TrellisEnforcement.reset(sessionID)
    TrellisEnforcement.onToolAfter(
      { sessionID, userMessageID, tool: "memory", args: { action: "recall", query: "timezone" } },
      { output: "none" },
    )
    TrellisEnforcement.onToolAfter(
      { sessionID, userMessageID, tool: "memory", args: { action: "remember", title: "Timezone" } },
      { output: "ok" },
    )

    const result = TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        tool: "calendar",
        args: { action: "create", title: "DOB", startAt: "2026-10-23", allDay: true },
      },
      { output: "ok" },
    )

    expect(result.hook).toBeUndefined()
  })

  test("skips plan agent", () => {
    TrellisEnforcement.reset(sessionID)
    const output = { output: "ok" }

    const result = TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        agent: "plan",
        tool: "cms",
        args: { action: "create_entry", collection: "organizations" },
      },
      output,
    )

    expect(result.output).toBe("ok")
    expect(result.hook).toBeUndefined()
  })

  test("does not treat failed create_entry as a graph write", () => {
    TrellisEnforcement.reset(sessionID)

    const result = TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        tool: "cms",
        args: { action: "create_entry", collection: "blog_post" },
      },
      {
        output: "Entry not created.",
        title: "Validation failed",
        metadata: { ok: false, collection: "blog_post", errors: ["name is required"] },
      },
    )

    expect(result.hook).toBeUndefined()
    expect(TrellisEnforcement.__state(sessionID)?.cmsCreates).toBe(0)
    expect(TrellisEnforcement.__state(sessionID)?.cmsEntryFailures).toBe(1)
  })

  test("appends cms reconcile reminder after failed create_entry and file fallback", () => {
    TrellisEnforcement.reset(sessionID)

    TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        tool: "cms",
        args: { action: "create_entry", collection: "blog_post" },
      },
      {
        output: "Entry not created.",
        title: "Validation failed",
        metadata: { ok: false, collection: "blog_post", errors: ["name is required"] },
      },
    )

    const result = TrellisEnforcement.onToolAfter(
      {
        sessionID,
        userMessageID,
        tool: "write",
        args: { filePath: "crdt-blog-post.md" },
      },
      { output: "wrote file", title: "crdt-blog-post.md" },
    )

    expect(result.output).toContain("CMS reconcile")
    expect(result.output).toContain("crdt-blog-post.md")
    expect(result.hook?.kind).toBe("cms-reconcile")
  })
})
