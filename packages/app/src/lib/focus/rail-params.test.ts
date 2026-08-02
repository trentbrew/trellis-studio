import { describe, expect, test } from "bun:test"
import { parseRailRoute, railFocusKey, railFocusLabel } from "./rail-params"

describe("rail-params", () => {
  test("cms collection and entry appear in focus label", () => {
    const route = parseRailRoute("cms", {
      view: "cms",
      cmsCollection: "bookmarks",
      cmsEntry: "bookmark:n8924e7",
    })
    expect(route?.surface).toBe("cms")
    expect(railFocusLabel(route!)).toBe("CMS · Bookmarks · n8924e7")
    expect(railFocusKey(route!)).toBe("bookmark:n8924e7")
  })

  test("assets section and selected file appear in focus label", () => {
    const route = parseRailRoute("assets", {
      view: "assets",
      section: "audio",
      asset: "dev-assets/apping.mp3",
    })
    expect(route?.surface).toBe("assets")
    expect(railFocusLabel(route!)).toBe("Assets · Audio · apping.mp3")
    expect(railFocusKey(route!)).toBe("asset:dev-assets/apping.mp3")
  })

  test("projection audio lens maps to assets surface", () => {
    const route = parseRailRoute("projection", {
      view: "projection",
      lens: "audio",
      section: "audio",
      asset: "dev-assets/apping.mp3",
    })
    expect(route?.surface).toBe("assets")
    expect(railFocusLabel(route!)).toBe("Assets · Audio · apping.mp3")
  })
})
