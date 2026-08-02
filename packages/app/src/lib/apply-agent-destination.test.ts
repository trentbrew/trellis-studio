import { describe, expect, test, mock } from "bun:test"
import { applyAgentTurnDestination } from "./apply-agent-destination"
import type { EntityNav } from "./entity-navigate"

function mockNav(overrides: Partial<EntityNav> = {}): EntityNav {
  const tabs = { open: mock(), setActive: mock() }
  const setFullscreen = mock()
  return {
    navigate: mock(),
    setSearchParams: mock(),
    searchParams: { view: "projection", lens: "whiteboards", section: "assets", asset: "dev/favicon.ico" },
    sessionKey: "workspace",
    file: {
      load: mock(),
      tab: mock(() => "tab:crdt-blog-post.md"),
    } as unknown as EntityNav["file"],
    layout: {
      tabs: mock(() => tabs),
      session: { setFullscreen },
    } as unknown as EntityNav["layout"],
    ...overrides,
  }
}

describe("applyAgentTurnDestination", () => {
  test("whiteboard destination sets shareable url param and clears stale rail params", async () => {
    const nav = mockNav()
    await applyAgentTurnDestination(
      {
        id: "whiteboard:@canvases/hateoas-diagram.whiteboard",
        kind: "whiteboard",
        path: "@canvases/hateoas-diagram.whiteboard",
        label: "View hateoas-diagram",
      },
      nav,
    )

    expect(nav.setSearchParams).toHaveBeenCalledWith({
      view: "projection",
      lens: "whiteboards",
      whiteboard: "@canvases/hateoas-diagram.whiteboard",
    })
  })

  test("exits fullscreen when navigating from a turn action", async () => {
    const nav = mockNav()
    await applyAgentTurnDestination(
      {
        id: "whiteboard:@canvases/hateoas-diagram.whiteboard",
        kind: "whiteboard",
        path: "@canvases/hateoas-diagram.whiteboard",
        label: "View hateoas-diagram",
      },
      nav,
    )

    expect(nav.layout.session.setFullscreen).toHaveBeenCalledWith("workspace", false)
  })

  test("file destination switches to code view and clears projection lens", async () => {
    const nav = mockNav()
    await applyAgentTurnDestination(
      { id: "file:crdt-blog-post.md", kind: "file", path: "crdt-blog-post.md", label: "Open crdt-blog-post.md" },
      nav,
    )

    expect(nav.file.load).toHaveBeenCalledWith("crdt-blog-post.md")
    expect(nav.setSearchParams).toHaveBeenCalledWith({
      view: "code",
      lens: undefined,
    })
  })
})
