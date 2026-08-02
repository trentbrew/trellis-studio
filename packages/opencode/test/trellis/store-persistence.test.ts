import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { TrellisVcsEngine } from "trellis"
import { Trellis } from "../../src/trellis"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("Trellis store persistence", () => {
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

  test("store facts survive engine reopen and project into graph", async () => {
    const facts = [
      { e: "1", a: "type", v: "Pokemon" },
      { e: "1", a: "name", v: "Bulbasaur" },
      { e: "1", a: "type", v: "Grass/Poison" },
      { e: "1", a: "hp", v: 45 },
    ]

    const result = await Instance.provide({ directory: dir, fn: () => Trellis.storeAssert(facts, dir) })
    expect(result).toEqual({ added: facts.length })
    expect(Trellis.storeEntities(dir, { type: "Pokemon" })).toContainEqual({
      id: "1",
      type: "Pokemon",
      label: "Bulbasaur",
    })

    await Instance.provide({
      directory: dir,
      fn: () =>
        Trellis.record({
          tool: "trellis_store_mutate",
          sessionID: "legacy",
          args: { action: "define", id: "25", type: "Pokemon", attrs: { name: "Pikachu", type: "Electric" } },
          output: "Created entity 25 [Pokemon] with 2 attributes",
        }),
    })

    Trellis.dispose(dir)
    await Instance.provide({ directory: dir, fn: () => Trellis.init(dir) })

    expect(Trellis.storeEntities(dir, { type: "Pokemon" })).toContainEqual({
      id: "1",
      type: "Pokemon",
      label: "Bulbasaur",
    })
    expect(Trellis.storeEntities(dir, { type: "Pokemon" })).toContainEqual({
      id: "25",
      type: "Pokemon",
      label: "Pikachu",
    })
    const graph = Trellis.graph(dir)
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: "1", label: "Bulbasaur", type: "Pokemon" }))
    expect(graph.nodes).toContainEqual(expect.objectContaining({ id: "25", label: "Pikachu", type: "Pokemon" }))
    expect(graph.edges).toContainEqual(
      expect.objectContaining({ source: expect.stringMatching(/^project:/), target: "1", type: "contains" }),
    )
  })
})
