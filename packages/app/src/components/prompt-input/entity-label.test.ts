import { describe, expect, test } from "bun:test"
import type { EntityPart } from "@/context/prompt"
import { entityPartDisplayText, entityPartVisibleText, resolveEntityPartLabel } from "./entity-label"

describe("entity-label", () => {
  const part: EntityPart = {
    type: "entity",
    entityType: "project",
    entityId: "project:50fab009",
    label: "Trellis",
    content: "@project:project:50fab009",
    start: 0,
    end: 0,
  }

  test("resolveEntityPartLabel prefers stored label", () => {
    expect(resolveEntityPartLabel(part)).toBe("Trellis")
  })

  test("entityPartDisplayText renders @mention label", () => {
    expect(entityPartDisplayText(part)).toBe("@Trellis")
  })

  test("entityPartVisibleText keeps hash and wiki syntax", () => {
    const hash: EntityPart = {
      ...part,
      entityType: "issue",
      entityId: "TRL-1",
      content: "#TRL-1",
      label: "TRL-1: Ship it",
    }
    const wiki: EntityPart = {
      ...part,
      entityType: "issue",
      entityId: "TRL-1",
      content: "[[issue:TRL-1]]",
      label: "Ship it",
    }

    expect(entityPartVisibleText(hash)).toBe("#TRL-1")
    expect(entityPartVisibleText(wiki)).toBe("[[issue:TRL-1]]")
  })

  test("resolveEntityPartLabel falls back to graph facts", () => {
    const bare: EntityPart = {
      type: "entity",
      entityType: "organization",
      entityId: "organization:b5813cff",
      content: "@organization:organization:b5813cff",
      start: 0,
      end: 0,
    }

    expect(
      resolveEntityPartLabel(bare, {
        issues: [],
        entityLabels: new Map([["organization:b5813cff", "Turtle"]]),
      }),
    ).toBe("Turtle")
  })
})
