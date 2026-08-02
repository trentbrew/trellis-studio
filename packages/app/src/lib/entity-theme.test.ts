import { describe, expect, test } from "bun:test"
import { entityTypeLabel } from "./entity-theme"

describe("entityTypeLabel", () => {
  test("uses PascalCase for system entity types", () => {
    expect(entityTypeLabel("file")).toBe("File")
    expect(entityTypeLabel("directory")).toBe("Directory")
    expect(entityTypeLabel("whiteboard")).toBe("Whiteboard")
    expect(entityTypeLabel("workunit")).toBe("WorkUnit")
  })

  test("normalizes schema labels and compound keys", () => {
    expect(entityTypeLabel("content", "content")).toBe("Content")
    expect(entityTypeLabel("agentlane")).toBe("AgentLane")
    expect(entityTypeLabel("agentlane", "Agentlane")).toBe("AgentLane")
    expect(entityTypeLabel("agentlane", "agent lane")).toBe("AgentLane")
  })
})
