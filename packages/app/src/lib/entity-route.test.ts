import { describe, expect, test } from "bun:test"
import { routeFromFacts } from "./entity-route"

describe("routeFromFacts", () => {
  test("routes cms entries by cms_status fact", () => {
    expect(
      routeFromFacts("bookmark:c89249e7", [
        { e: "bookmark:c89249e7", a: "type", v: "Bookmark" },
        { e: "bookmark:c89249e7", a: "cms_status", v: "published" },
        { e: "bookmark:c89249e7", a: "url", v: "https://example.com" },
      ]),
    ).toEqual({
      kind: "cms",
      collection: "bookmark",
      entry: "bookmark:c89249e7",
    })
  })

  test("routes link assets to design links by category fact", () => {
    expect(
      routeFromFacts("asset:.trellis/assets/links/ab12.link", [
        { e: "asset:.trellis/assets/links/ab12.link", a: "type", v: "Asset" },
        { e: "asset:.trellis/assets/links/ab12.link", a: "category", v: "link" },
        { e: "asset:.trellis/assets/links/ab12.link", a: "path", v: ".trellis/assets/links/ab12.link" },
      ]),
    ).toEqual({
      kind: "design",
      section: "links",
      entity: "asset:.trellis/assets/links/ab12.link",
      path: ".trellis/assets/links/ab12.link",
    })
  })

  test("routes video assets to design videos by category fact", () => {
    expect(
      routeFromFacts("asset:.trellis/media/clip.mp4", [
        { e: "asset:.trellis/media/clip.mp4", a: "type", v: "Asset" },
        { e: "asset:.trellis/media/clip.mp4", a: "category", v: "video" },
        { e: "asset:.trellis/media/clip.mp4", a: "path", v: ".trellis/media/clip.mp4" },
      ]),
    ).toEqual({
      kind: "design",
      section: "videos",
      entity: "asset:.trellis/media/clip.mp4",
      path: ".trellis/media/clip.mp4",
    })
  })

  test("routes document assets to design documents by category fact", () => {
    expect(
      routeFromFacts("asset:.trellis/media/spec.pdf", [
        { e: "asset:.trellis/media/spec.pdf", a: "type", v: "Asset" },
        { e: "asset:.trellis/media/spec.pdf", a: "category", v: "document" },
        { e: "asset:.trellis/media/spec.pdf", a: "path", v: ".trellis/media/spec.pdf" },
      ]),
    ).toEqual({
      kind: "design",
      section: "documents",
      entity: "asset:.trellis/media/spec.pdf",
      path: ".trellis/media/spec.pdf",
    })
  })

  test("routes icon entities to design icons section", () => {
    expect(
      routeFromFacts("icon:heart", [
        { e: "icon:heart", a: "type", v: "Icon" },
        { e: "icon:heart", a: "key", v: "heart" },
      ]),
    ).toEqual({
      kind: "design",
      section: "icons",
      entity: "icon:heart",
    })
  })

  test("routes brand entities to design brand section", () => {
    expect(
      routeFromFacts("brand:project-brand", [
        { e: "brand:project-brand", a: "type", v: "Brand" },
        { e: "brand:project-brand", a: "name", v: "Project Brand" },
      ]),
    ).toEqual({
      kind: "design",
      section: "brand",
      entity: "brand:project-brand",
    })
  })

  test("routes prefixed ids without cms_status to graph", () => {
    expect(routeFromFacts("note:c00b90c9")).toEqual({
      kind: "graph",
      id: "note:c00b90c9",
      type: "note",
    })
  })

  test("routes issues with TRL ids to trellis", () => {
    expect(
      routeFromFacts("issue:TRL-12", [{ e: "issue:TRL-12", a: "id", v: "TRL-12" }]),
    ).toEqual({
      kind: "trellis",
      issue: "TRL-12",
    })
  })
})
