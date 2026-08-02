import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { TrellisVcsEngine } from "trellis"
import { Instance } from "../../src/project/instance"
import { Trellis } from "../../src/trellis"
import * as SemanticLinks from "../../src/trellis/semantic-links"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

type StoreLink = { e1: string; a: string; e2: string }

Log.init({ print: false })

describe("semantic-links", () => {
  let dir: string
  let cleanup: { [Symbol.asyncDispose](): Promise<void> }
  const proto = TrellisVcsEngine.prototype as TrellisVcsEngine & { watch: () => void }
  const watch = proto.watch

  beforeAll(async () => {
    proto.watch = () => undefined
    const tmp = await tmpdir({ git: true })
    cleanup = tmp
    dir = tmp.path
    await Instance.provide({ directory: dir, fn: () => Trellis.init(dir) })
  })

  afterAll(async () => {
    proto.watch = watch
    Trellis.dispose(dir)
    await cleanup[Symbol.asyncDispose]()
  })

  test("wikiToEntityId resolves typed and system refs", () => {
    expect(SemanticLinks.wikiToEntityId("person:alex")).toBe("person:alex")
    expect(SemanticLinks.wikiToEntityId("TRL-5")).toBe("issue:TRL-5")
    expect(SemanticLinks.wikiToEntityId("docs/readme.md")).toBe("file:docs/readme.md")
    expect(SemanticLinks.wikiToEntityId('person:alex|Alex')).toBe("person:alex")
  })

  test("parseSemanticLinks splits body mentions and frontmatter edges", () => {
    const content = `---
title: Plan
lead_developer: [[person:alex]]
---
Discussed with [[project:atlas]] today.
`
    const links = SemanticLinks.parseSemanticLinks(content, "note:test")
    expect(links.some((l) => l.kind === "frontmatter" && l.relation === "lead_developer")).toBe(true)
    expect(links.some((l) => l.kind === "mention" && l.entityId === "project:atlas")).toBe(true)
  })

  test("sync materializes mentions and frontmatter links", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const content = `---
owner: [[person:taylor]]
---
See [[project:atlas]] for context.
`
        const result = SemanticLinks.sync("note:link-test", content, dir)
        expect(result.linked).toBeGreaterThanOrEqual(2)

        const links = Trellis.storeLinks(dir, { entity: "note:link-test" })
        expect(links.some((l: StoreLink) => l.a === "mentions" && l.e2 === "project:atlas")).toBe(true)
        expect(links.some((l: StoreLink) => l.a === "owner" && l.e2 === "person:taylor")).toBe(true)
        expect(Trellis.storeEntity("person:taylor", dir)).toBeTruthy()
      },
    })
  })

  test("sync reconciles removed wikilinks", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        SemanticLinks.sync("note:reconcile", "[[person:old]]", dir)
        SemanticLinks.sync("note:reconcile", "[[person:new]]", dir)
        const links = Trellis.storeLinks(dir, { entity: "note:reconcile", attribute: "mentions" })
        expect(links.some((l: StoreLink) => l.e2 === "person:old")).toBe(false)
        expect(links.some((l: StoreLink) => l.e2 === "person:new")).toBe(true)
      },
    })
  })

  test("syncCmsEntry materializes field-scoped mentions from rich_text", async () => {
    await Instance.provide({
      directory: dir,
      fn: () => {
        const schemaId = "schema:article"
        Trellis.storeAssert([
          { e: schemaId, a: "type", v: "TypeSchema" },
          { e: schemaId, a: "cms", v: true },
          {
            e: schemaId,
            a: "props",
            v: JSON.stringify([
              { key: "name", type: "text" },
              { key: "body", type: "rich_text" },
            ]),
          },
        ])
        const entryId = "article:cms-link-test"
        Trellis.storeAssert([
          { e: entryId, a: "type", v: "article" },
          { e: entryId, a: "cms_status", v: "draft" },
          { e: entryId, a: "name", v: "Test" },
          { e: entryId, a: "body", v: "See [[project:atlas]] and [[person:taylor]]." },
        ])

        const result = SemanticLinks.syncCmsEntry(entryId, dir)
        expect(result.linked).toBeGreaterThanOrEqual(2)

        const links = Trellis.storeLinks(dir, { entity: entryId })
        expect(links.some((l: StoreLink) => l.a === "body.mentions" && l.e2 === "project:atlas")).toBe(true)
        expect(links.some((l: StoreLink) => l.a === "body.mentions" && l.e2 === "person:taylor")).toBe(true)
      },
    })
  })
})
