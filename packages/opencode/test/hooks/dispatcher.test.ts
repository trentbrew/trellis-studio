import { describe, it, expect } from "bun:test"
import { HookDispatcher, aggregate } from "@/hooks/dispatcher"

describe("HookDispatcher", () => {
  it("runs handlers in priority order and aggregates to allow", async () => {
    const d = new HookDispatcher()
    const order: string[] = []
    d.register("preToolUse", async () => {
      order.push("low")
      return { continue: true }
    })
    d.register("preToolUse", async () => {
      order.push("high")
      return { continue: true }
    }, { priority: 10 })
    const r = await d.dispatch("preToolUse", { tool: "bash", args: {}, cwd: "/", sessionID: "s" })
    expect(r).toEqual({ continue: true, decision: "allow" })
    expect(order).toEqual(["high", "low"])
  })

  it("short-circuits on the first deny", async () => {
    const d = new HookDispatcher()
    let secondRan = false
    d.register("preToolUse", () => ({
      continue: false,
      decision: "deny",
      reason: "blocked",
    }))
    d.register("preToolUse", () => {
      secondRan = true
      return { continue: true }
    })
    const r = await d.dispatch("preToolUse", { tool: "bash", args: {}, cwd: "/", sessionID: "s" })
    expect(r).toMatchObject({ continue: false, decision: "deny", reason: "blocked" })
    expect(secondRan).toBe(false)
  })

  it("fails closed when a preToolUse handler crashes", async () => {
    const d = new HookDispatcher()
    d.register("preToolUse", () => {
      throw new Error("boom")
    })
    const r = await d.dispatch("preToolUse", { tool: "bash", args: {}, cwd: "/", sessionID: "s" })
    expect(r.continue).toBe(false)
    expect(r.decision).toBe("deny")
    expect(r.reason).toContain("boom")
  })

  it("passes through when an observe-only handler crashes", async () => {
    const d = new HookDispatcher()
    d.register("stop", () => {
      throw new Error("boom")
    })
    const r = await d.dispatch("stop", { sessionID: "s" })
    expect(r.continue).toBe(true)
  })

  it("returns allow for events with no handlers", async () => {
    const d = new HookDispatcher()
    expect(await d.dispatch("preCompact", { sessionID: "s" })).toEqual({
      continue: true,
      decision: "allow",
    })
  })

  it("dispatchVoid does not block the caller", async () => {
    const d = new HookDispatcher()
    let ran = false
    d.register("postToolUse", async () => {
      ran = true
      return { continue: true }
    })
    await d.dispatchVoid("postToolUse", { tool: "bash", args: {}, cwd: "/", sessionID: "s" })
    expect(ran).toBe(true)
  })
})

describe("aggregate", () => {
  it("deny beats later allows", () => {
    expect(
      aggregate([
        { continue: true },
        { continue: false, decision: "deny", reason: "x" },
        { continue: true },
      ]),
    ).toMatchObject({ continue: false, decision: "deny" })
  })
})
