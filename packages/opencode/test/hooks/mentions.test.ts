import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { TrellisVcsEngine } from "trellis"
import { Instance } from "../../src/project/instance"
import { Trellis } from "../../src/trellis"
import { parseMentions, mentionTargets, routeTurnEndMentions } from "../../src/trellis/mentions"
import { TrellisEnforcement } from "../../src/hooks/trellis-enforcement"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("trellis-mentions", () => {
  test("parseMentions extracts mention targets", () => {
    expect(parseMentions(undefined)).toEqual([])
    expect(parseMentions("")).toEqual([])
    expect(parseMentions("ping @human please")).toEqual(["@human"])
    expect(parseMentions("hand to @agent:explore")).toEqual(["@agent:explore"])
    expect(parseMentions("see @lane:lane-123 and @issue:TRL-7")).toEqual(["@lane:lane-123", "@issue:TRL-7"])
    expect(parseMentions("mixed @human @agent:reviewer")).toEqual(["@human", "@agent:reviewer"])
    // plain @refs, file paths, and emails are not mentions
    expect(parseMentions("@readme.md hello")).toEqual([])
    expect(parseMentions("email bob@example.com")).toEqual([])
  })

  describe("routeTurnEndMentions", () => {
    test("no mentions → no pause, no nudge", () => {
      const r = routeTurnEndMentions({ sessionID: "s1", agent: "build", assistantText: "done" })
      expect(r.pause).toBe(false)
      expect(r.mentions).toEqual([])
      expect(r.nudgeText).toBeUndefined()
    })

    test("@human pauses the turn", () => {
      const r = routeTurnEndMentions({
        sessionID: "s1",
        agent: "build",
        assistantText: "Should we merge? @human",
      })
      expect(r.pause).toBe(true)
      expect(r.mentions).toContain("@human")
    })

    test("@agent emits a follow-up nudge", () => {
      const r = routeTurnEndMentions({
        sessionID: "s1",
        agent: "build",
        assistantText: "@agent:explore look this up",
      })
      expect(r.pause).toBe(false)
      expect(r.nudgeText).toContain("explore")
    })

    test("@lane traces without pausing or nudging", () => {
      const r = routeTurnEndMentions({
        sessionID: "s1",
        agent: "build",
        assistantText: "work in @lane:lane-abc",
      })
      expect(r.pause).toBe(false)
      expect(r.nudgeText).toBeUndefined()
      expect(r.mentions).toEqual(["@lane:lane-abc"])
    })

    test("@human wins over @agent when both present", () => {
      const r = routeTurnEndMentions({
        sessionID: "s1",
        agent: "build",
        assistantText: "@agent:explore x then @human",
      })
      expect(r.pause).toBe(true)
    })
  })

  describe("turnEndNudge mention integration", () => {
    const sessionID = "sess-mention-nudge"
    const userMessageID = "user-mention-nudge"

    function seedTurn() {
      TrellisEnforcement.reset(sessionID)
      TrellisEnforcement.onToolAfter(
        { sessionID, userMessageID, tool: "read", args: { filePath: "a.ts" } },
        { output: "content" },
      )
    }

    test("@human ends the turn (no nudge)", () => {
      seedTurn()
      const r = TrellisEnforcement.turnEndNudge({
        sessionID,
        userMessageID,
        agent: "build",
        assistantText: "Decide for me @human",
      })
      expect(r).toBeUndefined()
    })

    test("@agent emits a mention routing nudge", () => {
      seedTurn()
      const r = TrellisEnforcement.turnEndNudge({
        sessionID,
        userMessageID,
        agent: "build",
        assistantText: "hand off to @agent:explore",
      })
      expect(r).toBeDefined()
      expect(r?.hook.kind).toBe("turn-end-mention")
      expect(r?.text).toContain("explore")
    })
  })

  describe("mentionTargets", () => {
    let dir: string
    let cleanup: { [Symbol.asyncDispose](): Promise<void> }
    const proto = TrellisVcsEngine.prototype as TrellisVcsEngine & { watch: () => void }
    const watch = proto.watch

    beforeAll(async () => {
      proto.watch = () => undefined
      const tmp = await tmpdir({ git: true })
      cleanup = tmp
      dir = tmp.path
      await Instance.provide({ directory: dir, fn: () => Trellis.init(dir, { create: true }) })
    })

    afterAll(async () => {
      proto.watch = watch
      Trellis.dispose(dir)
      await cleanup[Symbol.asyncDispose]()
    })

    test("always includes @human", () => {
      const targets = mentionTargets(dir)
      expect(targets.some((t) => t.id === "@human" && t.kind === "human")).toBe(true)
    })

    test("lists active lanes as @lane targets", async () => {
      const eng = Trellis.engine(dir)
      expect(eng).toBeDefined()
      const meta = await eng!.createLane({ sessionId: "sess-mention-test" })
      const targets = mentionTargets(dir)
      const laneTarget = targets.find((t) => t.kind === "lane" && t.laneId === meta.id)
      expect(laneTarget).toBeDefined()
      expect(laneTarget?.id).toBe(`@lane:${meta.id}`)
    })
  })
})
