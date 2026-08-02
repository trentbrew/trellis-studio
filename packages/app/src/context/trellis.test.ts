import { describe, expect, test } from "bun:test"
import { trellisUrl } from "./trellis"

describe("trellisUrl", () => {
  test("appends directory after existing query params", () => {
    const url = trellisUrl(
      "http://localhost:4096",
      "/Users/test/.turtlecode/workspaces/example.build",
      "/ops?limit=50",
    )

    expect(url).toBe(
      "http://localhost:4096/trellis/ops?limit=50&directory=%2FUsers%2Ftest%2F.turtlecode%2Fworkspaces%2Fexample.build",
    )
  })

  test("builds plain trellis URLs without double question marks", () => {
    const url = trellisUrl("http://localhost:4096", "/repo", "/issues")

    expect(url).toBe("http://localhost:4096/trellis/issues?directory=%2Frepo")
  })

  test("garden path with multiple query params", () => {
    const url = trellisUrl("http://localhost:4096", "/repo", "/garden?status=abandoned&keyword=refactor&limit=10")
    const parsed = new URL(url)
    expect(parsed.pathname).toBe("/trellis/garden")
    expect(parsed.searchParams.get("status")).toBe("abandoned")
    expect(parsed.searchParams.get("keyword")).toBe("refactor")
    expect(parsed.searchParams.get("limit")).toBe("10")
    expect(parsed.searchParams.get("directory")).toBe("/repo")
  })

  test("branches path without query params", () => {
    const url = trellisUrl("http://localhost:4096", "/my/project", "/branches")
    expect(url).toBe("http://localhost:4096/trellis/branches?directory=%2Fmy%2Fproject")
  })

  test("milestones path without query params", () => {
    const url = trellisUrl("http://localhost:4096", "/repo", "/milestones")
    expect(url).toBe("http://localhost:4096/trellis/milestones?directory=%2Frepo")
  })

  test("garden revive path with encoded cluster id", () => {
    const url = trellisUrl("http://localhost:4096", "/repo", "/garden/abc-123/revive")
    expect(url).toBe("http://localhost:4096/trellis/garden/abc-123/revive?directory=%2Frepo")
  })

  test("delete branch path with encoded name", () => {
    const url = trellisUrl("http://localhost:4096", "/repo", "/branches/feature%2Ffoo")
    const parsed = new URL(url)
    expect(parsed.pathname).toBe("/trellis/branches/feature%2Ffoo")
    expect(parsed.searchParams.get("directory")).toBe("/repo")
  })

  test("directory with spaces is encoded", () => {
    const url = trellisUrl("http://localhost:4096", "/Users/test/my project", "/stats")
    const parsed = new URL(url)
    expect(parsed.searchParams.get("directory")).toBe("/Users/test/my project")
  })

  test("decisions chain path with encoded entity", () => {
    const url = trellisUrl("http://localhost:4096", "/repo", "/decisions/chain/issue%3ATRL-5")
    const parsed = new URL(url)
    expect(parsed.pathname).toBe("/trellis/decisions/chain/issue%3ATRL-5")
    expect(parsed.searchParams.get("directory")).toBe("/repo")
  })
})
