import { describe, expect, test } from "bun:test"
import { searchMentions } from "./mention-search"

const file = {
  searchFiles: async () => [],
}

const sync = {
  data: {
    agent: [],
  },
}

describe("searchMentions", () => {
  test("prioritizes general store entities over decision history", async () => {
    const results = await searchMentions({
      query: "",
      file,
      sync,
      trellis: {
        ready: true,
        issues: [{ id: "TRL-1", title: "Fix mention picker" }],
        storeEntities: [
          { id: "person:ada", type: "Person" },
          { id: "organization:openai", type: "Organization" },
        ],
        fetchDecisions: async () =>
          Array.from({ length: 10 }, (_, idx) => ({ id: `decision:${idx}`, toolName: "trellis_store_mutate" })),
        fetchMilestones: async () => [],
      },
    })

    expect(results.slice(0, 2).map((item) => item.id)).toEqual(["person:ada", "organization:openai"])
    expect(results.some((item) => item.id === "TRL-1")).toBe(true)
    expect(results.find((item) => item.id === "person:ada")?.detail).toBe("Person")
  })

  test("matches entities by display name from store label", async () => {
    const results = await searchMentions({
      query: "matthew",
      file,
      sync,
      trellis: {
        ready: true,
        issues: [],
        storeEntities: [{ id: "person:65a9702a", type: "Person", label: "Matthew Manning" }],
        fetchDecisions: async () => [],
        fetchMilestones: async () => [],
      },
    })

    expect(results.map((item) => item.id)).toContain("person:65a9702a")
    expect(results.find((item) => item.id === "person:65a9702a")?.label).toBe("Matthew Manning")
  })

  test("loads paginated store entities lazily when the caller only has a fetcher", async () => {
    let calls = 0
    const results = await searchMentions({
      query: "person",
      file,
      sync,
      trellis: {
        ready: true,
        issues: [],
        fetchStoreEntities: async () => {
          calls++
          return [{ id: "person:grace", type: "Person" }]
        },
        fetchDecisions: async () => [],
        fetchMilestones: async () => [],
      },
    })

    expect(calls).toBe(1)
    expect(results.map((item) => item.id)).toContain("person:grace")
  })
})
