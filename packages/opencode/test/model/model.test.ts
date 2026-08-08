import { describe, expect, test } from "bun:test"
import { Model, type Adapter, type Delta, type Provider, type Request, type Status } from "../../src/model"
import { json, lines } from "../../src/model/stream"

function stream(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      const encoder = new TextEncoder()
      for (const chunk of chunks) ctrl.enqueue(encoder.encode(chunk))
      ctrl.close()
    },
  })
}

function fake(input: { id: string; up: boolean; words?: string[]; warms?: boolean }): Adapter {
  return {
    id: input.id,
    name: input.id,
    platform: "test",
    endpoint: `http://127.0.0.1/${input.id}`,
    caps: { context: 8, output: 8, streaming: true, reuse: true, trust: ["fast", "full"], memory: 1 },
    probe: async () => input.up,
    create() {
      const status: Status = { state: "disconnected", load: 0, ram: 0, sessions: 0, warm: false }
      let warms = 0
      const provider: Provider = {
        id: input.id,
        endpoint: `http://127.0.0.1/${input.id}`,
        async init() {
          status.state = "ready"
          return status
        },
        async warm() {
          warms++
          status.warm = input.warms !== false
          return status
        },
        async shutdown() {
          status.state = "disconnected"
          status.warm = false
        },
        status: () => status,
        async reset() {},
        async *generate(req: Request): AsyncIterable<Delta> {
          status.sessions++
          const words = input.words ?? ["hello", " world"]
          try {
            for (const [i, text] of words.entries()) {
              yield { text, first: i === 0, done: i === words.length - 1, index: i }
              await new Promise((r) => setTimeout(r, 1))
            }
          } finally {
            status.sessions--
          }
        },
      }
      return Object.defineProperty(provider, "warms", { get: () => warms })
    },
  }
}

describe("stream", () => {
  test("splits ndjson across chunk boundaries", async () => {
    const out: string[] = []
    for await (const line of lines(stream(['{"a":1}\n{"b', '":2}\n{"c":3}']))) out.push(line)
    expect(out).toEqual(['{"a":1}', '{"b":2}', '{"c":3}'])
  })

  test("json returns undefined on malformed payloads", () => {
    expect(json('{"ok":true}')?.ok).toBe(true)
    expect(json("data: nope")).toBeUndefined()
  })
})

describe("detection", () => {
  test("reports availability per adapter", async () => {
    const found = await Model.detect([fake({ id: "up", up: true }), fake({ id: "down", up: false })])
    expect(found.map((x) => x.id)).toEqual(["up", "down"])
    expect(found[0].available).toBe(true)
    expect(found[1].available).toBe(false)
  })

  test("connects to the first available backend in preference order", async () => {
    const list = [fake({ id: "native", up: false }), fake({ id: "portable", up: true })]
    const { backend } = await Model.connect(undefined, list)
    expect(backend.id).toBe("portable")
  })

  test("honors an available preference", async () => {
    const list = [fake({ id: "native", up: true }), fake({ id: "portable", up: true })]
    const { backend } = await Model.connect("portable", list)
    expect(backend.id).toBe("portable")
  })

  test("falls back when the preferred backend is down", async () => {
    const list = [fake({ id: "native", up: true }), fake({ id: "portable", up: false })]
    const { backend } = await Model.connect("portable", list)
    expect(backend.id).toBe("native")
  })

  test("throws with install guidance when nothing is running", async () => {
    const list = [fake({ id: "native", up: false })]
    expect(Model.connect(undefined, list)).rejects.toThrow(/No model backend is running/)
  })
})

describe("streaming", () => {
  test("emits deltas incrementally with a first-token marker", async () => {
    const { provider } = await Model.connect(undefined, [fake({ id: "up", up: true, words: ["a", "b", "c"] })])
    const out: Delta[] = []
    for await (const delta of provider.generate({
      session: "s1",
      messages: [{ role: "user", content: "hi" }],
      config: Model.DEFAULTS,
      trust: "fast",
    })) {
      out.push(delta)
    }
    expect(out.map((x) => x.text).join("")).toBe("abc")
    expect(out[0].first).toBe(true)
    expect(out[0].index).toBe(0)
    expect(out.at(-1)?.done).toBe(true)
  })

  test("tracks active sessions across a generation", async () => {
    const { provider } = await Model.connect(undefined, [fake({ id: "up", up: true })])
    expect(provider.status().sessions).toBe(0)
    let during = 0
    for await (const _ of provider.generate({
      session: "s1",
      messages: [{ role: "user", content: "hi" }],
      config: Model.DEFAULTS,
      trust: "full",
    })) {
      during = provider.status().sessions
    }
    expect(during).toBe(1)
    expect(provider.status().sessions).toBe(0)
  })
})

describe("warming", () => {
  test("connect warms the weights by default", async () => {
    const { provider } = await Model.connect(undefined, [fake({ id: "up", up: true })])
    expect(provider.status().warm).toBe(true)
    expect((provider as unknown as { warms: number }).warms).toBe(1)
  })

  test("warming can be skipped for callers that only probe", async () => {
    const { provider } = await Model.connect(undefined, [fake({ id: "up", up: true })], false)
    expect(provider.status().warm).toBe(false)
    expect((provider as unknown as { warms: number }).warms).toBe(0)
  })

  test("a backend that refuses to warm still connects", async () => {
    const { provider } = await Model.connect(undefined, [fake({ id: "up", up: true, warms: false })])
    expect(provider.status().state).toBe("ready")
    expect(provider.status().warm).toBe(false)
  })

  test("shutdown clears the warm flag", async () => {
    const { provider } = await Model.connect(undefined, [fake({ id: "up", up: true })])
    await provider.shutdown()
    expect(provider.status().warm).toBe(false)
  })
})

describe("selector", () => {
  test("reuses the connected provider and clears it on redetect", async () => {
    const list = [fake({ id: "up", up: true })]
    const sel = Model.selector(list)
    const first = await sel.select()
    const second = await sel.select()
    expect(second.provider).toBe(first.provider)
    expect(sel.status().state).toBe("ready")

    await sel.redetect()
    expect(sel.provider).toBeUndefined()
    expect(sel.status()).toEqual(Model.IDLE)
  })
})
