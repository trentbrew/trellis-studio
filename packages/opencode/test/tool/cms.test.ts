import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { TrellisVcsEngine } from "trellis"
import { CmsTool } from "../../src/tool/cms"
import type { Tool } from "../../src/tool/tool"
import { Trellis } from "../../src/trellis"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const proto = TrellisVcsEngine.prototype as TrellisVcsEngine & { watch: () => void }
const watch = proto.watch

function ctx(): Tool.Context<Record<string, unknown>> {
  return {
    sessionID: "ses_test" as Tool.Context["sessionID"],
    messageID: "msg_test" as Tool.Context["messageID"],
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata() {},
    ask: async () => {},
  }
}

describe("cms tool entries", () => {
  beforeAll(() => {
    proto.watch = () => undefined
  })

  afterAll(() => {
    proto.watch = watch
  })

  test("does not create ghost entries without values", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    const tool = await CmsTool.init()

    await Instance.provide({
      directory: tmp.path,
      fn: () => tool.execute({ action: "create_collection", collection: "product", label: "Product" }, ctx()),
    })

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () => tool.execute({ action: "create_entry", collection: "product" }, ctx()),
    })

    expect(result.title).toBe("No entry created")
    expect(result.output).toContain("values is required")
    expect(Trellis.storeEntities(tmp.path, { type: "product", limit: 100 })).toEqual([])
    Trellis.dispose(tmp.path)
  })

  test("does not create ghost entries from formula-only values", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    await Instance.provide({
      directory: tmp.path,
      fn: () =>
        Trellis.storeAssert(
          [
            { e: "schema:product", a: "type", v: "TypeSchema" },
            { e: "schema:product", a: "cms", v: true },
            { e: "schema:product", a: "label", v: "Product" },
            {
              e: "schema:product",
              a: "props",
              v: JSON.stringify([{ key: "score", label: "Score", type: "formula", formula: "1 + 1" }]),
            },
          ],
          tmp.path,
        ),
    })
    const tool = await CmsTool.init()

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () => tool.execute({ action: "create_entry", collection: "product", values: { score: 2 } }, ctx()),
    })

    expect(result.title).toBe("No entry created")
    expect(result.output).toContain("virtual formula fields")
    expect(Trellis.storeEntities(tmp.path, { type: "product", limit: 100 })).toEqual([])
    Trellis.dispose(tmp.path)
  })

  test("rejects create_collection for reserved system keys", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    const tool = await CmsTool.init()

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () =>
        tool.execute({ action: "create_collection", collection: "project", label: "Projects" }, ctx()),
    })

    expect(result.title).toBe("Reserved key")
    expect(result.output).toContain("portfolio")
    expect(Trellis.storeEntity("schema:project", tmp.path)).toBeUndefined()
    Trellis.dispose(tmp.path)
  })

  test("rejects inferred entries on reserved keys without a schema", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    const tool = await CmsTool.init()

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () =>
        tool.execute(
          { action: "create_entry", collection: "project", values: { name: "POWDER", status: "Active" } },
          ctx(),
        ),
    })

    expect(result.title).toBe("Reserved key")
    expect(result.output).toContain("portfolio")
    expect(Trellis.storeEntities(tmp.path, { type: "project", limit: 100 })).toEqual([])
    Trellis.dispose(tmp.path)
  })

  test("creates entries when writable values are provided", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    const tool = await CmsTool.init()

    await Instance.provide({
      directory: tmp.path,
      fn: () => tool.execute({ action: "create_collection", collection: "product", label: "Product" }, ctx()),
    })

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () =>
        tool.execute(
          { action: "create_entry", collection: "product", values: { name: "POWDER", status: "Active" } },
          ctx(),
        ),
    })

    expect(result.title).toStartWith("Created product:")
    expect(result.metadata.ok).toBe(true)
    const id = result.metadata.id as string
    expect(Trellis.storeEntity(id, tmp.path)?.facts).toEqual(
      expect.arrayContaining([
        { e: id, a: "type", v: "product" },
        { e: id, a: "cms_status", v: "draft" },
        { e: id, a: "name", v: "POWDER" },
        { e: id, a: "status", v: "Active" },
      ]),
    )
    Trellis.dispose(tmp.path)
  })

  test("rejects create_entry when collection is not registered", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    const tool = await CmsTool.init()

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () =>
        tool.execute({ action: "create_entry", collection: "article", values: { name: "Hello" } }, ctx()),
    })

    expect(result.title).toBe("No collection")
    expect(result.metadata.ok).toBe(false)
    expect(result.output).toContain("create_collection")
    Trellis.dispose(tmp.path)
  })

  test("rejects create_entry when required fields are missing", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    await Instance.provide({
      directory: tmp.path,
      fn: () =>
        Trellis.storeAssert(
          [
            { e: "schema:product", a: "type", v: "TypeSchema" },
            { e: "schema:product", a: "cms", v: true },
            { e: "schema:product", a: "label", v: "Product" },
            {
              e: "schema:product",
              a: "props",
              v: JSON.stringify([
                { key: "name", label: "Name", type: "text", required: true },
                { key: "status", label: "Status", type: "select", options: ["Active", "Done"] },
              ]),
            },
          ],
          tmp.path,
        ),
    })
    const tool = await CmsTool.init()

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () => tool.execute({ action: "create_entry", collection: "product", values: { status: "Active" } }, ctx()),
    })

    expect(result.title).toBe("Validation failed")
    expect(result.metadata.ok).toBe(false)
    expect(result.output).toContain('"name" is required')
    expect(Trellis.storeEntities(tmp.path, { type: "product", limit: 100 })).toEqual([])
    Trellis.dispose(tmp.path)
  })

  test("rejects create_entry on type mismatch and invalid select", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    await Instance.provide({
      directory: tmp.path,
      fn: () =>
        Trellis.storeAssert(
          [
            { e: "schema:product", a: "type", v: "TypeSchema" },
            { e: "schema:product", a: "cms", v: true },
            { e: "schema:product", a: "label", v: "Product" },
            {
              e: "schema:product",
              a: "props",
              v: JSON.stringify([
                { key: "budget", label: "Budget", type: "number" },
                { key: "status", label: "Status", type: "select", options: ["Active", "Done"] },
              ]),
            },
          ],
          tmp.path,
        ),
    })
    const tool = await CmsTool.init()

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () =>
        tool.execute(
          { action: "create_entry", collection: "product", values: { budget: "not-a-number", status: "Unknown" } },
          ctx(),
        ),
    })

    expect(result.title).toBe("Validation failed")
    expect(result.output).toContain("expected number")
    expect(result.output).toContain("expected one of Active, Done")
    expect(Trellis.storeEntities(tmp.path, { type: "product", limit: 100 })).toEqual([])
    Trellis.dispose(tmp.path)
  })

  test("coerces string numbers into actual numbers", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    await Instance.provide({
      directory: tmp.path,
      fn: () =>
        Trellis.storeAssert(
          [
            { e: "schema:product", a: "type", v: "TypeSchema" },
            { e: "schema:product", a: "cms", v: true },
            { e: "schema:product", a: "label", v: "Product" },
            {
              e: "schema:product",
              a: "props",
              v: JSON.stringify([{ key: "budget", label: "Budget", type: "number" }]),
            },
          ],
          tmp.path,
        ),
    })
    const tool = await CmsTool.init()

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () => tool.execute({ action: "create_entry", collection: "product", values: { budget: "4200" } }, ctx()),
    })

    expect(result.title).toStartWith("Created product:")
    const id = result.metadata.id as string
    const facts = Trellis.storeEntity(id, tmp.path)?.facts ?? []
    const budget = facts.find((f: { a: string; v: unknown }) => f.a === "budget")
    expect(budget?.v).toBe(4200)
    Trellis.dispose(tmp.path)
  })

  test("enforces number min/max bounds on create_entry", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    await Instance.provide({
      directory: tmp.path,
      fn: () =>
        Trellis.storeAssert(
          [
            { e: "schema:product", a: "type", v: "TypeSchema" },
            { e: "schema:product", a: "cms", v: true },
            { e: "schema:product", a: "label", v: "Product" },
            {
              e: "schema:product",
              a: "props",
              v: JSON.stringify([{ key: "score", label: "Score", type: "number", min: 0, max: 10 }]),
            },
          ],
          tmp.path,
        ),
    })
    const tool = await CmsTool.init()

    const low = await Instance.provide({
      directory: tmp.path,
      fn: () => tool.execute({ action: "create_entry", collection: "product", values: { score: -1 } }, ctx()),
    })
    expect(low.title).toBe("Validation failed")
    expect(low.output).toContain("must be >= 0")

    const high = await Instance.provide({
      directory: tmp.path,
      fn: () => tool.execute({ action: "create_entry", collection: "product", values: { score: 11 } }, ctx()),
    })
    expect(high.title).toBe("Validation failed")
    expect(high.output).toContain("must be <= 10")

    const ok = await Instance.provide({
      directory: tmp.path,
      fn: () => tool.execute({ action: "create_entry", collection: "product", values: { score: 5 } }, ctx()),
    })
    expect(ok.title).toStartWith("Created product:")
    Trellis.dispose(tmp.path)
  })

  test("update_schema persists min/max/step/repeat on per-field entities", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    await Instance.provide({
      directory: tmp.path,
      fn: () =>
        Trellis.storeAssert(
          [
            { e: "schema:product", a: "type", v: "TypeSchema" },
            { e: "schema:product", a: "cms", v: true },
            { e: "schema:product", a: "label", v: "Product" },
            { e: "schema:product", a: "props", v: "[]" },
            { e: "schema:product", a: "cms", v: true },
          ],
          tmp.path,
        ),
    })
    const tool = await CmsTool.init()

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () =>
        tool.execute(
          {
            action: "update_schema",
            collection: "product",
            fields: [
              { key: "score", type: "number", min: 0, max: 100, step: 5 },
              { key: "due", type: "date", repeat: "weekly" },
              { key: "hero", type: "image" },
            ],
          },
          ctx(),
        ),
    })

    expect(result.title).toBe("Updated schema for product")

    const scoreFacts = Trellis.storeEntity("field:product.score", tmp.path)?.facts ?? []
    expect(scoreFacts).toEqual(
      expect.arrayContaining([
        { e: "field:product.score", a: "min", v: 0 },
        { e: "field:product.score", a: "max", v: 100 },
        { e: "field:product.score", a: "step", v: 5 },
      ]),
    )

    const dueFacts = Trellis.storeEntity("field:product.due", tmp.path)?.facts ?? []
    expect(dueFacts).toEqual(
      expect.arrayContaining([{ e: "field:product.due", a: "repeat", v: "weekly" }]),
    )

    const heroFacts = Trellis.storeEntity("field:product.hero", tmp.path)?.facts ?? []
    expect(heroFacts).toEqual(
      expect.arrayContaining([{ e: "field:product.hero", a: "kind", v: "image" }]),
    )

    const propsFact = Trellis.storeEntity("schema:product", tmp.path)?.facts.find(
      (f: { a: string }) => f.a === "props",
    )
    const defs = JSON.parse(propsFact?.v as string) as Array<Record<string, unknown>>
    const score = defs.find((d) => d.key === "score")
    expect(score).toMatchObject({ min: 0, max: 100, step: 5 })
    const due = defs.find((d) => d.key === "due")
    expect(due).toMatchObject({ repeat: "weekly" })
    Trellis.dispose(tmp.path)
  })

  test("rejects update_entry with invalid value types", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    await Instance.provide({
      directory: tmp.path,
      fn: () =>
        Trellis.storeAssert(
          [
            { e: "schema:product", a: "type", v: "TypeSchema" },
            { e: "schema:product", a: "cms", v: true },
            { e: "schema:product", a: "label", v: "Product" },
            {
              e: "schema:product",
              a: "props",
              v: JSON.stringify([{ key: "budget", label: "Budget", type: "number" }]),
            },
            { e: "product:x1", a: "type", v: "product" },
            { e: "product:x1", a: "cms_status", v: "draft" },
            { e: "product:x1", a: "budget", v: 100 },
          ],
          tmp.path,
        ),
    })
    const tool = await CmsTool.init()

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () => tool.execute({ action: "update_entry", id: "product:x1", values: { budget: "bad" } }, ctx()),
    })

    expect(result.title).toBe("Validation failed")
    expect(result.output).toContain("expected number")
    const facts = Trellis.storeEntity("product:x1", tmp.path)?.facts ?? []
    expect(facts.find((f: { a: string; v: unknown }) => f.a === "budget")?.v).toBe(100)
    Trellis.dispose(tmp.path)
  })

  test("maps legacy title to name and derives slug on create_entry", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    const tool = await CmsTool.init()

    await Instance.provide({
      directory: tmp.path,
      fn: () => tool.execute({ action: "create_collection", collection: "bookmark", label: "Bookmarks" }, ctx()),
    })

    const result = await Instance.provide({
      directory: tmp.path,
      fn: () =>
        tool.execute(
          {
            action: "create_entry",
            collection: "bookmark",
            values: { title: "The third hard problem", url: "https://example.com/post" },
          },
          ctx(),
        ),
    })

    expect(result.title).toStartWith("Created bookmark:")
    const id = result.metadata.id as string
    const facts = Trellis.storeEntity(id, tmp.path)?.facts ?? []
    expect(facts).toEqual(
      expect.arrayContaining([
        { e: id, a: "name", v: "The third hard problem" },
        { e: id, a: "slug", v: "the-third-hard-problem" },
        { e: id, a: "url", v: "https://example.com/post" },
      ]),
    )
    expect(facts.some((f: { a: string }) => f.a === "title")).toBe(false)
    Trellis.dispose(tmp.path)
  })

  test("remaps title field to name in update_schema", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({ directory: tmp.path, fn: () => Trellis.init(tmp.path) })
    await Instance.provide({
      directory: tmp.path,
      fn: () =>
        Trellis.storeAssert(
          [
            { e: "schema:bookmark", a: "type", v: "TypeSchema" },
            { e: "schema:bookmark", a: "label", v: "Bookmarks" },
            { e: "schema:bookmark", a: "cms", v: true },
          ],
          tmp.path,
        ),
    })
    const tool = await CmsTool.init()

    await Instance.provide({
      directory: tmp.path,
      fn: () =>
        tool.execute(
          {
            action: "update_schema",
            collection: "bookmark",
            fields: [
              { key: "title", type: "text", required: true },
              { key: "url", type: "url", required: true },
            ],
          },
          ctx(),
        ),
    })

    const propsFact = Trellis.storeEntity("schema:bookmark", tmp.path)?.facts.find(
      (f: { a: string }) => f.a === "props",
    )
    const defs = JSON.parse(propsFact?.v as string) as Array<{ key: string }>
    expect(defs.map((d) => d.key)).toEqual(["name", "url"])
    expect(defs.some((d) => d.key === "title")).toBe(false)
    Trellis.dispose(tmp.path)
  })
})
