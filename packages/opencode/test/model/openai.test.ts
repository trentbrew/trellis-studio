import { afterAll, expect, test } from "bun:test"
import { openai } from "../../src/model/openai"
import { Model, type Delta } from "../../src/model"

const sse = ["hel", "lo", " there"]
  .map((text) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)
  .join("")

const reasoning =
  ["let me think", " about it"]
    .map((text) => `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: text } }] })}\n\n`)
    .join("") + `data: ${JSON.stringify({ choices: [{ delta: { content: "answer" } }] })}\n\ndata: [DONE]\n\n`

let seen: Record<string, any> | undefined

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === "/health") return Response.json({ ram_usage_bytes: 4096 })
    if (url.pathname === "/v1/chat/completions") {
      seen = (await req.json()) as Record<string, any>
      const body = seen?.model === "reasoner" ? reasoning : sse + "data: [DONE]\n\n"
      return new Response(body, { headers: { "Content-Type": "text/event-stream" } })
    }
    return new Response("not found", { status: 404 })
  },
})

afterAll(() => server.stop(true))

const provider = () =>
  openai({
    id: "test",
    endpoint: server.url.origin,
    health: "/health",
    model: "gemma4",
    ram: (payload) => Number(payload.ram_usage_bytes ?? 0),
    session: true,
  })

test("connect reports ready and reads ram from the health payload", async () => {
  const status = await provider().init()
  expect(status.state).toBe("ready")
  expect(status.ram).toBe(4096)
})

test("parses sse deltas and terminates on [DONE]", async () => {
  const p = provider()
  await p.init()
  const out: Delta[] = []
  for await (const delta of p.generate({
    session: "abc",
    messages: [{ role: "user", content: "hi" }],
    config: Model.DEFAULTS,
    trust: "fast",
  })) {
    out.push(delta)
  }
  expect(out.map((x) => x.text).join("")).toBe("hello there")
  expect(out[0].first).toBe(true)
  expect(out.at(-1)?.done).toBe(true)
  expect(p.status().sessions).toBe(0)
})

test("forwards the session id for kv cache reuse", async () => {
  const p = provider()
  await p.init()
  for await (const _ of p.generate({
    session: "cache-key",
    messages: [{ role: "user", content: "hi" }],
    config: Model.DEFAULTS,
    trust: "fast",
  })) {
  }
  expect(seen?.user).toBe("cache-key")
  expect(seen?.stream).toBe(true)
  expect(seen?.max_tokens).toBe(Model.DEFAULTS.max)
})

test("surfaces an unreachable server as an error status", async () => {
  const dead = openai({ id: "dead", endpoint: "http://127.0.0.1:1", health: "/health", model: "gemma4" })
  const status = await dead.init()
  expect(status.state).toBe("error")
  expect(status.error).toBeTruthy()
})

test("flags reasoning deltas so they stay out of the answer", async () => {
  const p = openai({ id: "reasoner", endpoint: server.url.origin, health: "/health", model: "reasoner" })
  await p.init()
  const out: Delta[] = []
  for await (const delta of p.generate({
    session: "r",
    messages: [{ role: "user", content: "hi" }],
    config: Model.DEFAULTS,
    trust: "fast",
  })) {
    out.push(delta)
  }
  const think = out.filter((x) => x.thinking)
  const answer = out.filter((x) => !x.thinking && x.text)
  expect(think.map((x) => x.text).join("")).toBe("let me think about it")
  expect(answer.map((x) => x.text).join("")).toBe("answer")
  // The first *visible* token is the one that opens the assistant message.
  expect(think.every((x) => !x.first)).toBe(true)
  expect(answer[0].first).toBe(true)
})
