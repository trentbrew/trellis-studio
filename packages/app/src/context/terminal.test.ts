import { beforeAll, describe, expect, mock, test } from "bun:test"

let getWorkspaceTerminalCacheKey: (dir: string) => string
let getLegacyTerminalStorageKeys: (dir: string, legacySessionID?: string) => string[]
let migrateTerminalState: (value: unknown) => unknown
let replacePaneIds: typeof import("./terminal").replacePaneIds

beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useNavigate: () => () => undefined,
    useParams: () => ({}),
  }))
  mock.module("@opencode-ai/ui/context", () => ({
    createSimpleContext: () => ({
      use: () => undefined,
      provider: () => undefined,
    }),
  }))
  const mod = await import("./terminal")
  getWorkspaceTerminalCacheKey = mod.getWorkspaceTerminalCacheKey
  getLegacyTerminalStorageKeys = mod.getLegacyTerminalStorageKeys
  migrateTerminalState = mod.migrateTerminalState
  replacePaneIds = mod.replacePaneIds
})

describe("getWorkspaceTerminalCacheKey", () => {
  test("uses workspace-only directory cache key", () => {
    expect(getWorkspaceTerminalCacheKey("/repo")).toBe("/repo:__workspace__")
  })
})

describe("replacePaneIds", () => {
  test("rewrites leaf ids inside split pane trees", () => {
    expect(
      replacePaneIds(
        {
          type: "split",
          direction: "h",
          ratio: 0.5,
          a: { type: "leaf", ptyId: "old-a" },
          b: {
            type: "split",
            direction: "v",
            ratio: 0.4,
            a: { type: "leaf", ptyId: "old-b" },
            b: { type: "leaf", ptyId: "kept" },
          },
        },
        new Map([
          ["old-a", "new-a"],
          ["old-b", "new-b"],
        ]),
      ),
    ).toEqual({
      type: "split",
      direction: "h",
      ratio: 0.5,
      a: { type: "leaf", ptyId: "new-a" },
      b: {
        type: "split",
        direction: "v",
        ratio: 0.4,
        a: { type: "leaf", ptyId: "new-b" },
        b: { type: "leaf", ptyId: "kept" },
      },
    })
  })
})

describe("getLegacyTerminalStorageKeys", () => {
  test("keeps workspace storage path when no legacy session id", () => {
    expect(getLegacyTerminalStorageKeys("/repo")).toEqual(["/repo/terminal.v1"])
  })

  test("includes legacy session path before workspace path", () => {
    expect(getLegacyTerminalStorageKeys("/repo", "session-123")).toEqual([
      "/repo/terminal/session-123.v1",
      "/repo/terminal.v1",
    ])
  })
})

describe("migrateTerminalState", () => {
  test("drops invalid terminals and restores a valid active terminal", () => {
    expect(
      migrateTerminalState({
        active: "missing",
        all: [
          null,
          { id: "one", title: "Terminal 2" },
          { id: "one", title: "duplicate", titleNumber: 9 },
          { id: "two", title: "logs", titleNumber: 4, rows: 24, cols: 80 },
          { title: "no-id" },
        ],
      }),
    ).toEqual({
      active: "one",
      all: [
        { id: "one", title: "Terminal 2", titleNumber: 2 },
        { id: "two", title: "logs", titleNumber: 4, rows: 24, cols: 80 },
      ],
    })
  })

  test("keeps a valid active id", () => {
    expect(
      migrateTerminalState({
        active: "two",
        all: [
          { id: "one", title: "Terminal 1" },
          { id: "two", title: "shell", titleNumber: 7 },
        ],
      }),
    ).toEqual({
      active: "two",
      all: [
        { id: "one", title: "Terminal 1", titleNumber: 1 },
        { id: "two", title: "shell", titleNumber: 7 },
      ],
    })
  })
})
