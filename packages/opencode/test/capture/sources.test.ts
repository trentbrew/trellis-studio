import { describe, expect, test } from "bun:test"
import { collect } from "../../src/capture/sources"

describe("capture.sources", () => {
  test("collects metadata sources from websearch", () => {
    const items = collect({
      tool: "websearch",
      result: {
        metadata: {
          sources: ["https://a.example", "https://b.example"],
        },
      },
    })

    expect(items.map((item) => item.url)).toEqual(["https://a.example/", "https://b.example/"])
  })

  test("collects webfetch url from args", () => {
    const items = collect({
      tool: "webfetch",
      args: { url: "https://docs.example/guide" },
      result: { title: "Guide (text/html)" },
    })

    expect(items).toHaveLength(1)
    expect(items[0]?.url).toBe("https://docs.example/guide")
    expect(items[0]?.title).toBe("Guide")
  })

  test("extracts urls from deep research output", () => {
    const items = collect({
      tool: "deep_research",
      result: {
        output: "See https://competitor.ai and https://other.dev/page for details.",
      },
    })

    expect(items.map((item) => item.url)).toEqual(["https://competitor.ai/", "https://other.dev/page"])
  })
})
