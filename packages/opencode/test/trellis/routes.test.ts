import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { writeFileSync } from "fs"
import { join } from "path"
import { Hono } from "hono"
import { TrellisVcsEngine } from "trellis"
import { Trellis } from "../../src/trellis"
import { Instance } from "../../src/project/instance"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

const proto = TrellisVcsEngine.prototype as TrellisVcsEngine & { watch: () => void }
const watch = proto.watch

// We import TrellisRoutes lazily to avoid circular init issues.
// The routes module uses `lazy()`, so we call the factory to get the Hono app.
let app: Hono
let dir: string
let cleanup: { [Symbol.asyncDispose](): Promise<void> }

async function req(method: string, path: string, body?: unknown) {
  const url = new URL(`http://localhost/trellis${path}`)
  if (!url.searchParams.has("directory")) {
    url.searchParams.set("directory", dir)
  }
  const init: RequestInit = { method }
  if (body) {
    init.headers = { "Content-Type": "application/json" }
    init.body = JSON.stringify(body)
  }
  // Wrap in Instance.provide to simulate the production server context
  return Instance.provide({
    directory: dir,
    fn: () => app.request(url.toString(), init),
  })
}

beforeAll(async () => {
  proto.watch = () => undefined
  const tmp = await tmpdir({ git: true })
  cleanup = tmp
  dir = tmp.path

  await Instance.provide({
    directory: dir,
    fn: () => Trellis.init(dir),
  })

  writeFileSync(
    join(dir, ".trellis/tests.json"),
    `${JSON.stringify(
      {
        version: 1,
        defaultSuite: "unit",
        suites: {
          unit: { description: "Unit tests", command: "true" },
        },
        promote: { require: [] },
        issueStart: {
          default: [{ description: "Unit tests pass", suite: "unit" }],
        },
      },
      null,
      2,
    )}\n`,
  )

  const { TrellisRoutes } = await import("../../src/server/routes/trellis")
  const root = new Hono()
  root.route("/trellis", TrellisRoutes())
  app = root
})

afterAll(async () => {
  proto.watch = watch
  Trellis.dispose(dir)
  await cleanup[Symbol.asyncDispose]()
})

// ---------------------------------------------------------------------------
// Read-only endpoints
// ---------------------------------------------------------------------------

describe("GET routes", () => {
  test("GET /status returns 200", async () => {
    const res = await req("GET", "/status")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.branch).toBeString()
    expect(data.totalOps).toBeNumber()
  })

  test("GET /stats returns 200", async () => {
    const res = await req("GET", "/stats")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.issueCount).toBeNumber()
    expect(data.branch).toBeString()
    expect(data.totalOps).toBeNumber()
    expect(data.trackedFiles).toBeNumber()
    expect(data.nodeCount).toBeNumber()
    expect(data.edgeCount).toBeNumber()
    expect(data.avgIssueHealth).toBeNumber()
    // Regression: a dev marker `debug: "hot-reload-test"` once leaked into this
    // response and shipped to deployed Sprites. Guard against reintroduction.
    expect(data.debug).toBeUndefined()
  })

  test("GET /issues returns 200 array", async () => {
    const res = await req("GET", "/issues")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test("GET /files returns 200 array", async () => {
    const res = await req("GET", "/files")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test("GET /ops returns 200 array", async () => {
    const res = await req("GET", "/ops")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThan(0)
  })

  test("GET /decisions returns 200 array", async () => {
    const res = await req("GET", "/decisions")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test("GET /branches returns 200 array", async () => {
    const res = await req("GET", "/branches")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThanOrEqual(1)
  })

  test("GET /milestones returns 200 array", async () => {
    const res = await req("GET", "/milestones")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test("GET /garden returns 200 array", async () => {
    const res = await req("GET", "/garden")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test("GET /garden/stats returns 200", async () => {
    const res = await req("GET", "/garden/stats")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.total).toBeNumber()
  })
})

// ---------------------------------------------------------------------------
// Issue CRUD + lifecycle
// ---------------------------------------------------------------------------

describe("Issue routes", () => {
  let id: string

  test("POST /issues creates issue", async () => {
    const res = await req("POST", "/issues", {
      title: "Route test issue",
      priority: "high",
      labels: ["test"],
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toBeDefined()
    // The response is the op, not the issue — find the issue via list
    const list = await req("GET", "/issues")
    const issues = await list.json()
    const found = issues.find((i: any) => i.title === "Route test issue")
    expect(found).toBeDefined()
    id = found.id
  })

  test("GET /issues/:id returns issue", async () => {
    const res = await req("GET", `/issues/${id}`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe(id)
    expect(data.title).toBe("Route test issue")
  })

  test("PUT /issues/:id updates issue", async () => {
    const res = await req("PUT", `/issues/${id}`, {
      description: "updated desc",
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.description).toBe("updated desc")
  })

  test("POST /issues/:id/triage transitions to queue", async () => {
    const res = await req("POST", `/issues/${id}/triage`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe("queue")
  })

  test("POST /issues/:id/start transitions to in_progress", async () => {
    const res = await req("POST", `/issues/${id}/start`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe("in_progress")
  })

  test("POST /issues/:id/pause transitions to paused", async () => {
    const res = await req("POST", `/issues/${id}/pause`, { note: "lunch" })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe("paused")
  })

  test("POST /issues/:id/resume transitions to in_progress", async () => {
    const res = await req("POST", `/issues/${id}/resume`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe("in_progress")
  })

  test("POST /issues/:id/check satisfies criteria", async () => {
    const res = await req("POST", `/issues/${id}/check`)
    expect(res.status).toBe(200)
  })

  test("POST /issues/:id/close transitions to closed", async () => {
    const res = await req("POST", `/issues/${id}/close`, { confirm: true })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe("closed")
  })

  test("POST /issues/:id/reopen transitions back", async () => {
    const res = await req("POST", `/issues/${id}/reopen`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(["queue", "backlog", "in_progress"]).toContain(data.status)
  })

  test("POST /issues/:id/assign sets assignee", async () => {
    const res = await req("POST", `/issues/${id}/assign`, { agent: "cascade" })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.assignee).toBe("cascade")
  })

  test("POST /issues/:id/criteria adds criterion", async () => {
    const res = await req("POST", `/issues/${id}/criteria`, {
      description: "tests pass",
      command: "bun test",
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.criteriaCount).toBeGreaterThanOrEqual(1)
  })

  test("GET /issues/:id 404 for missing issue", async () => {
    const res = await req("GET", "/issues/TRL-99999")
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Branch routes
// ---------------------------------------------------------------------------

describe("Branch routes", () => {
  test("POST /branches creates branch", async () => {
    const res = await req("POST", "/branches", { name: "route-test" })
    expect(res.status).toBe(200)
  })

  test("POST /branches/switch switches branch", async () => {
    const res = await req("POST", "/branches/switch", { name: "route-test" })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.branch).toBe("route-test")

    // Switch back
    await req("POST", "/branches/switch", { name: "main" })
  })

  test("DELETE /branches/:name deletes branch", async () => {
    const res = await req("DELETE", "/branches/route-test")
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Milestone routes
// ---------------------------------------------------------------------------

describe("Milestone routes", () => {
  test("POST /milestones creates milestone", async () => {
    const res = await req("POST", "/milestones", { message: "route test checkpoint" })
    expect(res.status).toBe(200)
  })

  test("GET /milestones includes new milestone", async () => {
    const res = await req("GET", "/milestones")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Eval routes
// ---------------------------------------------------------------------------

describe("Eval routes", () => {
  test("GET /eval/summary returns 200", async () => {
    const res = await req("GET", "/eval/summary")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.totalDecisions).toBeNumber()
    expect(data.totalIssues).toBeNumber()
    expect(data.avgDecisionQuality).toBeNumber()
    expect(data.avgIssueHealth).toBeNumber()
    expect(data.gardenClusters).toBeNumber()
  })

  test("GET /eval/issue/:id returns score for existing issue", async () => {
    // Create an issue first so we have something to score
    const create = await req("POST", "/issues", { title: "Eval test issue", priority: "medium" })
    expect(create.status).toBe(200)

    const list = await req("GET", "/issues")
    const issues = await list.json()
    const found = issues.find((i: any) => i.title === "Eval test issue")
    expect(found).toBeDefined()

    const res = await req("GET", `/eval/issue/${found.id}`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe(found.id)
    expect(data.health).toBeNumber()
    expect(data.metrics.criteriaRate).toBeNumber()
  })

  test("GET /eval/issue/:id returns 404 for missing issue", async () => {
    const res = await req("GET", "/eval/issue/TRL-99999")
    expect(res.status).toBe(404)
  })

  test("GET /eval/agent/:id returns report", async () => {
    const res = await req("GET", "/eval/agent/test-agent")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.agent).toBe("test-agent")
    expect(data.decisions).toBeNumber()
    expect(data.avgQuality).toBeNumber()
  })

  test("GET /eval/session/:id returns report", async () => {
    const res = await req("GET", "/eval/session/ses_test")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.session).toBe("ses_test")
    expect(data.efficiency).toBeDefined()
    expect(data.decisions).toBeArray()
  })
})

// ---------------------------------------------------------------------------
// EAV Store — Database tab endpoints. These power the Data/Ontology UI and
// are polled by the app; a regression here flooded Sprite consoles with 404s.
// ---------------------------------------------------------------------------

describe("EAV store routes", () => {
  test("GET /store/stats returns counts", async () => {
    const res = await req("GET", "/store/stats")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.totalFacts).toBeNumber()
    expect(data.totalLinks).toBeNumber()
    expect(data.uniqueEntities).toBeNumber()
    expect(data.uniqueAttributes).toBeNumber()
    expect(data.catalogEntries).toBeNumber()
  })

  test("GET /store/catalog returns attribute entries", async () => {
    const res = await req("GET", "/store/catalog")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test("GET /store/entities returns list", async () => {
    const res = await req("GET", "/store/entities")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(data[0].id).toBeString()
      expect(data[0].type).toBeString()
    }
  })

  test("GET /store/entities?type= filters by type", async () => {
    const res = await req("GET", "/store/entities?type=Issue")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
    for (const e of data) expect(e.type).toBe("Issue")
  })

  test("GET /store/facts returns array", async () => {
    const res = await req("GET", "/store/facts")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test("GET /store/facts supports offset pagination", async () => {
    await Instance.provide({
      directory: dir,
      fn: () =>
        Trellis.storeAssert([
          { e: "page:test", a: "page", v: "one" },
          { e: "page:test", a: "page", v: "two" },
          { e: "page:test", a: "page", v: "three" },
        ]),
    })
    const one = await (await req("GET", "/store/facts?attribute=page&limit=1&offset=0")).json()
    const two = await (await req("GET", "/store/facts?attribute=page&limit=1&offset=1")).json()
    expect(one).toEqual([{ e: "page:test", a: "page", v: "one" }])
    expect(two).toEqual([{ e: "page:test", a: "page", v: "two" }])
  })

  test("GET /store/facts accepts client page size", async () => {
    const res = await req("GET", "/store/facts?limit=1000&offset=0")
    expect(res.status).toBe(200)
  })

  test("GET /store/facts rejects limit above server max", async () => {
    const res = await req("GET", "/store/facts?limit=100001")
    expect(res.status).toBe(400)
  })

  test("GET /store/links returns array", async () => {
    const res = await req("GET", "/store/links")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })

  test("GET /store/entity/:id returns facts+links shape", async () => {
    // Use a real entity id straight from the store so the handler finds facts.
    // Issue ids from /issues can diverge from EAV keys depending on the write
    // path; /store/entities is always the authoritative source of store keys.
    const entities = await (await req("GET", "/store/entities")).json()
    if (entities.length === 0) return
    const target = entities[0]
    const res = await req("GET", `/store/entity/${encodeURIComponent(target.id)}`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe(target.id)
    expect(Array.isArray(data.facts)).toBe(true)
    expect(Array.isArray(data.links)).toBe(true)
    expect(data.facts.length).toBeGreaterThan(0)
  })

  test("GET /store/entity/:id returns 404 for missing entity", async () => {
    const res = await req("GET", "/store/entity/does-not-exist-xyz")
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Graph / refs / backlinks
// ---------------------------------------------------------------------------

describe("Graph and references", () => {
  test("GET /graph returns nodes and edges", async () => {
    const res = await req("GET", "/graph")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.nodes)).toBe(true)
    expect(Array.isArray(data.edges)).toBe(true)
  })

  test("GET /refs/:entity returns outgoing + incoming", async () => {
    const res = await req("GET", "/refs/nonexistent-entity")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.outgoing).toBeDefined()
    expect(data.incoming).toBeDefined()
  })

  test("GET /backlinks/:entity returns array", async () => {
    const res = await req("GET", "/backlinks/nonexistent-entity")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Dogfood
// ---------------------------------------------------------------------------

describe("Dogfood routes", () => {
  test("GET /dogfood returns status", async () => {
    const res = await req("GET", "/dogfood")
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Directory scoping — query param must pin the right engine. Also exercises
// the "wrong directory" path that returns 404 with an initErrorBody, which
// is what produced the Sprite 404 noise during hot-reload.
// ---------------------------------------------------------------------------

describe("Directory scoping", () => {
  test("explicit ?directory= matches the tmp workspace", async () => {
    // Override the helper's auto-append by passing a path with the query string baked in.
    const url = new URL(`http://localhost/trellis/stats`)
    url.searchParams.set("directory", dir)
    const res = await Instance.provide({
      directory: dir,
      fn: () => app.request(url.toString(), { method: "GET" }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.branch).toBeString()
  })

  test("unknown path under /trellis returns 404", async () => {
    const res = await req("GET", "/this-route-does-not-exist")
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Polling smoke — the app's TrellisContext polls /status, /stats, and
// /store/stats on setInterval. Hammering them concurrently should never
// produce 404s or 5xx while the engine is healthy. This is the regression
// test for the Sprite hot-reload incident.
// ---------------------------------------------------------------------------

describe("Polling smoke", () => {
  test("concurrent /status + /stats + /store/stats all succeed", async () => {
    const paths = ["/status", "/stats", "/store/stats"] as const
    const rounds = 5
    const waves = await Promise.all(Array.from({ length: rounds }, () => Promise.all(paths.map((p) => req("GET", p)))))
    for (const wave of waves) {
      for (const res of wave) {
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toBeDefined()
      }
    }
  })
})
