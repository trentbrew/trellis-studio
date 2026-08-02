import { describe, expect, test } from "bun:test"
import { agentIcon, messageAgentName } from "./agent"

describe("agentIcon", () => {
  test("maps known agents to lucide icon names", () => {
    expect(agentIcon("build")).toBe("hammer")
    expect(agentIcon("plan")).toBe("clipboard-list")
  })

  test("falls back for unknown agents", () => {
    expect(agentIcon("custom-agent")).toBe("message-square")
    expect(agentIcon()).toBe("message-square")
  })
})

describe("messageAgentName", () => {
  test("returns the latest user-selected agent", () => {
    const name = messageAgentName([
      { role: "user", agent: "build" },
      { role: "assistant" },
      { role: "user", agent: "plan" },
    ])
    expect(name).toBe("plan")
  })
})
