import { describe, expect, test } from "bun:test"
import { applyFocusRailHints } from "./rail-labels"
import { parseRailRoute, railFocusLabel } from "./rail-params"

describe("rail-labels", () => {
  test("enriches cms entry title without changing url slugs", () => {
    const route = parseRailRoute("cms", {
      view: "cms",
      cmsCollection: "bookmarks",
      cmsEntry: "bookmark:n8924e7",
    })
    expect(route?.itemSlug).toBe("bookmark:n8924e7")
    const enriched = applyFocusRailHints(route!, {
      surface: "cms",
      routeSlug: "bookmarks",
      itemSlug: "bookmark:n8924e7",
      routeLabel: "Bookmarks",
      itemLabel: "Trellis docs",
    })
    expect(railFocusLabel(enriched)).toBe("CMS · Bookmarks · Trellis docs")
    expect(enriched.payload.itemTitle).toBe("Trellis docs")
    expect(enriched.payload.entry).toBe("bookmark:n8924e7")
  })

  test("enriches asset title from panel hints", () => {
    const route = parseRailRoute("assets", {
      view: "assets",
      section: "audio",
      asset: "dev-assets/apping.mp3",
    })
    const enriched = applyFocusRailHints(route!, {
      surface: "assets",
      routeSlug: "audio",
      itemSlug: "dev-assets/apping.mp3",
      routeLabel: "Audio",
      itemLabel: "App intro sting",
    })
    expect(railFocusLabel(enriched)).toBe("Assets · Audio · App intro sting")
    expect(enriched.payload.itemTitle).toBe("App intro sting")
  })

  test("ignores hints when slugs do not match", () => {
    const route = parseRailRoute("cms", {
      view: "cms",
      cmsCollection: "bookmarks",
      cmsEntry: "bookmark:n8924e7",
    })
    const enriched = applyFocusRailHints(route!, {
      surface: "cms",
      routeSlug: "posts",
      itemSlug: "bookmark:n8924e7",
      itemLabel: "Wrong collection",
    })
    expect(railFocusLabel(enriched)).toBe("CMS · Bookmarks · n8924e7")
  })
})
