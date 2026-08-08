import { afterAll, expect, test } from "bun:test"
import { ADAPTERS } from "../../src/model/adapters"
import { Model, type Delta } from "../../src/model"

const adapter = ADAPTERS.find((x) => x.id === "ollama")!

let seen: Record<string, any> | undefined

const ndjson = [
  { message: { role: "assistant", content: "", thinking: "hmm" }, done: false },
  { message: { role: "assistant", content: "", thinking: " ok" }, done: false },
  { message: { role: "assistant", content: "the " }, done: false },
  { message: { role: "assistant", content: "answer" }, done: true },
]
  .map((x) => JSON.stringify(x) + "\n")
  .join("")

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/api/tags") return Response.json({ models: [{ size: 10 }] })
    if (url.pathname === "/api/ps") return Response.json({ models: [{ model: "gemma4:latest" }] })
    if (url.pathname === "/api/chat") {
      seen = (await req.json()) as Record<string, any>
      return new Response(ndjson, { headers: { "Content-Type": "application/x-ndjson" } })
    }
    return new Response("not found", { status: 404 })
  },
})

afterAll(() => server.stop(true))

const provider = () => adapter.create(server.url.origin)

test("separates reasoning from the answer", async () => {
  const p = provider()
  await p.init()
  const out: Delta[] = []
  for await (const delta of p.generate({
    session: "s",
    messages: [{ role: "user", content: "hi" }],
    config: Model.DEFAULTS,
    trust: "fast",
  })) {
    out.push(delta)
  }
  expect(
    out
      .filter((x) => x.thinking)
      .map((x) => x.text)
      .join(""),
  ).toBe("hmm ok")
  expect(
    out
      .filter((x) => !x.thinking)
      .map((x) => x.text)
      .join(""),
  ).toBe("the answer")
})

test("budgets reasoning on top of the visible token cap", async () => {
  const p = provider()
  await p.init()
  for await (const _ of p.generate({
    session: "s",
    messages: [{ role: "user", content: "hi" }],
    config: { max: 256, temp: 0, think: 2048 },
    trust: "fast",
  })) {
  }
  // Without the extra allowance, reasoning consumes the whole cap and the
  // answer never arrives.
  expect(seen?.options?.num_predict).toBe(2304)
})

test("keeps the model pinned past the default idle eviction", async () => {
  const p = provider()
  await p.init()
  for await (const _ of p.generate({
    session: "s",
    messages: [{ role: "user", content: "hi" }],
    config: Model.DEFAULTS,
    trust: "fast",
  })) {
  }
  expect(seen?.keep_alive).toBe("2h")
})

test("warm reports resident weights without generating", async () => {
  const p = provider()
  await p.init()
  seen = undefined
  const status = await p.warm()
  expect(status.warm).toBe(true)
  // /api/ps already showed the model resident, so no load request was needed.
  expect(seen).toBeUndefined()
})

test("llama.cpp probe does not claim a TurboFieldfare server on the shared port", async () => {
  // Both listen on 8080 and both answer /v1/models; only the owner tag differs.
  const turbo = Bun.serve({
    port: 0,
    fetch: () => Response.json({ object: "list", data: [{ id: "gemma-4", owned_by: "turbofieldfare" }] }),
  })
  const real = Bun.serve({
    port: 0,
    fetch: () => Response.json({ object: "list", data: [{ id: "gemma4", owned_by: "llamacpp" }] }),
  })
  const cpp = ADAPTERS.find((x) => x.id === "llama.cpp")!
  try {
    expect(await cpp.probe(turbo.url.origin)).toBe(false)
    expect(await cpp.probe(real.url.origin)).toBe(true)
  } finally {
    turbo.stop(true)
    real.stop(true)
  }
})

test("endpoint defaults are overridable for non-standard ports", async () => {
  const custom = Bun.serve({ port: 0, fetch: () => Response.json({ status: "ok" }) })
  try {
    process.env["TRELLIS_TURBOFIELDFARE_URL"] = custom.url.origin
    const mod = await import(`../../src/model/adapters?override=${Date.now()}`)
    const turbo = mod.ADAPTERS.find((x: { id: string }) => x.id === "turbofieldfare")!
    expect(turbo.endpoint).toBe(custom.url.origin)
    expect(await turbo.probe()).toBe(true)
  } finally {
    delete process.env["TRELLIS_TURBOFIELDFARE_URL"]
    custom.stop(true)
  }
})

test("a malformed endpoint override falls back to the documented default", async () => {
  try {
    process.env["TRELLIS_OLLAMA_URL"] = "not a url"
    const mod = await import(`../../src/model/adapters?bad=${Date.now()}`)
    const ollama = mod.ADAPTERS.find((x: { id: string }) => x.id === "ollama")!
    expect(ollama.endpoint).toBe("http://127.0.0.1:11434")
  } finally {
    delete process.env["TRELLIS_OLLAMA_URL"]
  }
})
