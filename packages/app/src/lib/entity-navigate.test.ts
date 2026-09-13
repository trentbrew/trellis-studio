import { describe, expect, test } from "bun:test"
import { applyEntityRoute, handleReferenceClick, type EntityNav } from "./entity-navigate"
import { entityTab } from "./entity-tab"

type Spy = {
  nav: EntityNav
  navigate: string[]
  params: Record<string, string | undefined>[]
  push: Array<{ id: string; type: string }>
  tabs: string[]
  active?: string
}

const spy = (): Spy => {
  const state: Spy = {
    navigate: [],
    params: [],
    push: [],
    tabs: [],
    nav: {} as EntityNav,
  }
  state.nav = {
    navigate: (path) => state.navigate.push(path),
    setSearchParams: (params) => state.params.push(params),
    searchParams: { view: "code" },
    sessionKey: "s1",
    layout: {
      tabs: () => ({
        open: (tab: string) => {
          if (!state.tabs.includes(tab)) state.tabs.push(tab)
        },
        setActive: (tab: string) => {
          state.active = tab
        },
        all: () => state.tabs,
        active: () => state.active,
        close: () => undefined,
        move: () => undefined,
      }),
    } as unknown as EntityNav["layout"],
    dialog: {
      push: (id: string, type?: string) => {
        state.push.push({ id, type: type ?? "entity" })
      },
    } as unknown as EntityNav["dialog"],
    file: undefined,
  }
  return state
}

describe("applyEntityRoute dialogOnly", () => {
  test("actor graph route opens dialog without changing view", () => {
    const s = spy()
    applyEntityRoute({ kind: "graph", id: "person:alice", type: "person" }, s.nav, { dialogOnly: true })
    expect(s.push).toEqual([{ id: "person:alice", type: "person" }])
    expect(s.params).toEqual([])
    expect(s.tabs).toEqual([])
  })

  test("document graph route opens session tab instead of dialog", () => {
    const s = spy()
    applyEntityRoute({ kind: "graph", id: "artifact:jd", type: "artifact" }, s.nav, { dialogOnly: true })
    expect(s.push).toEqual([])
    expect(s.tabs).toEqual([entityTab("artifact:jd")])
    expect(s.active).toBe(entityTab("artifact:jd"))
    expect(s.params).toEqual([{ view: "code" }])
  })

  test("container graph route opens session tab", () => {
    const s = spy()
    applyEntityRoute({ kind: "graph", id: "project:rox-interview", type: "project" }, s.nav)
    expect(s.push).toEqual([])
    expect(s.tabs).toEqual([entityTab("project:rox-interview")])
    expect(s.params).toEqual([{ view: "code" }])
  })

  test("actor graph route still switches view when not dialogOnly", () => {
    const s = spy()
    applyEntityRoute({ kind: "graph", id: "person:alice", type: "person" }, s.nav)
    expect(s.params).toEqual([{ view: "graph" }])
    expect(s.push).toEqual([{ id: "person:alice", type: "person" }])
  })

  test("trellis issue opens dialog when dialogOnly", () => {
    const s = spy()
    applyEntityRoute({ kind: "trellis", issue: "TRL-2" }, s.nav, { dialogOnly: true })
    expect(s.push).toEqual([{ id: "issue:TRL-2", type: "issue" }])
    expect(s.navigate).toEqual([])
  })
})

describe("handleReferenceClick wiki issue", () => {
  test("wiki issue link opens dialog only", async () => {
    const s = spy()
    const event = { preventDefault: () => { } } as MouseEvent
    const handled = handleReferenceClick("wiki://issue/TRL-3", s.nav, event)
    expect(handled).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(s.push).toEqual([{ id: "issue:TRL-3", type: "issue" }])
    expect(s.navigate).toEqual([])
    expect(s.params).toEqual([])
  })
})
