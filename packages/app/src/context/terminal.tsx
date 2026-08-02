import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { batch, createEffect, createMemo, createRoot, createSignal, on, onCleanup } from "solid-js"
import { useParams } from "@solidjs/router"
import { useSDK } from "./sdk"
import type { Platform } from "./platform"
import { defaultTitle, titleNumber } from "./terminal-title"
import { Persist, persisted, removePersisted } from "@/utils/persist"
import { decode64 } from "@/utils/base64"

export type LocalPTY = {
  id: string
  title: string
  titleNumber: number
  rows?: number
  cols?: number
  buffer?: string
  scrollY?: number
  cursor?: number
}

export type PaneLeaf = { type: "leaf"; ptyId: string }
export type PaneSplit = { type: "split"; direction: "h" | "v"; ratio: number; a: PaneNode; b: PaneNode }
export type PaneNode = PaneLeaf | PaneSplit

const WORKSPACE_KEY = "__workspace__"
const MAX_TERMINAL_SESSIONS = 20

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function numberFromTitle(title: string) {
  return titleNumber(title, MAX_TERMINAL_SESSIONS)
}

function pty(value: unknown): LocalPTY | undefined {
  if (!record(value)) return

  const id = text(value.id)
  if (!id) return

  const title = text(value.title) ?? ""
  const number = num(value.titleNumber)
  const rows = num(value.rows)
  const cols = num(value.cols)
  const buffer = text(value.buffer)
  const scrollY = num(value.scrollY)
  const cursor = num(value.cursor)

  return {
    id,
    title,
    titleNumber: number && number > 0 ? number : (numberFromTitle(title) ?? 0),
    ...(rows !== undefined ? { rows } : {}),
    ...(cols !== undefined ? { cols } : {}),
    ...(buffer !== undefined ? { buffer } : {}),
    ...(scrollY !== undefined ? { scrollY } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
  }
}

export function migrateTerminalState(value: unknown) {
  if (!record(value)) return value

  const seen = new Set<string>()
  const all = (Array.isArray(value.all) ? value.all : []).flatMap((item) => {
    const next = pty(item)
    if (!next || seen.has(next.id)) return []
    seen.add(next.id)
    return [next]
  })

  const active = text(value.active)

  return {
    active: active && seen.has(active) ? active : all[0]?.id,
    all,
  }
}

export function getWorkspaceTerminalCacheKey(dir: string) {
  return `${dir}:${WORKSPACE_KEY}`
}

export function getLegacyTerminalStorageKeys(dir: string, legacySessionID?: string) {
  if (!legacySessionID) return [`${dir}/terminal.v1`]
  return [`${dir}/terminal/${legacySessionID}.v1`, `${dir}/terminal.v1`]
}

type TerminalSession = ReturnType<typeof createWorkspaceTerminalSession>

type TerminalCacheEntry = {
  value: TerminalSession
  dispose: VoidFunction
}

const caches = new Set<Map<string, TerminalCacheEntry>>()

const trimTerminal = (pty: LocalPTY) => {
  if (!pty.buffer && pty.cursor === undefined && pty.scrollY === undefined) return pty
  return {
    ...pty,
    buffer: undefined,
    cursor: undefined,
    scrollY: undefined,
  }
}

export function replacePaneIds(node: PaneNode | undefined, ids: Map<string, string>): PaneNode | undefined {
  if (!node) return undefined
  if (node.type === "leaf") return { ...node, ptyId: ids.get(node.ptyId) ?? node.ptyId }
  return {
    ...node,
    a: replacePaneIds(node.a, ids)!,
    b: replacePaneIds(node.b, ids)!,
  }
}

export function clearWorkspaceTerminals(dir: string, sessionIDs?: string[], platform?: Platform) {
  const key = getWorkspaceTerminalCacheKey(dir)
  for (const cache of caches) {
    const entry = cache.get(key)
    entry?.value.clear()
  }

  removePersisted(Persist.workspace(dir, "terminal"), platform)

  const legacy = new Set(getLegacyTerminalStorageKeys(dir))
  for (const id of sessionIDs ?? []) {
    for (const key of getLegacyTerminalStorageKeys(dir, id)) {
      legacy.add(key)
    }
  }
  for (const key of legacy) {
    removePersisted({ key }, platform)
  }
}

function createWorkspaceTerminalSession(sdk: ReturnType<typeof useSDK>, dir: string, legacySessionID?: string) {
  const decoded = decode64(dir) ?? dir
  const dirBase = decoded.replace(/\/+$/, "").split("/").at(-1) || decoded.split("\\").at(-1) || decoded
  const legacy = getLegacyTerminalStorageKeys(dir, legacySessionID)

  const [store, setStore, _, persistedReady] = persisted(
    {
      ...Persist.workspace(dir, "terminal", legacy),
      migrate: migrateTerminalState,
    },
    createStore<{
      active?: string
      all: LocalPTY[]
      paneTree?: PaneNode
      focusedPane?: string
    }>({
      all: [],
    }),
  )
  const [serverReady, setServerReady] = createSignal(false)
  const ready = createMemo(() => persistedReady() && serverReady())

  const pickNextTerminalNumber = () => {
    const existingTitleNumbers = new Set(
      store.all.flatMap((pty) => {
        const direct = Number.isFinite(pty.titleNumber) && pty.titleNumber > 0 ? pty.titleNumber : undefined
        if (direct !== undefined) return [direct]
        const parsed = numberFromTitle(pty.title)
        if (parsed === undefined) return []
        return [parsed]
      }),
    )

    return (
      Array.from({ length: existingTitleNumbers.size + 1 }, (_, index) => index + 1).find(
        (number) => !existingTitleNumbers.has(number),
      ) ?? 1
    )
  }

  const removeExited = (id: string) => {
    const all = store.all
    const index = all.findIndex((x) => x.id === id)
    if (index === -1) return
    const active = store.active === id ? (index === 0 ? all[1]?.id : all[0]?.id) : store.active
    batch(() => {
      setStore("active", active)
      setStore(
        "all",
        produce((draft) => {
          draft.splice(index, 1)
        }),
      )
    })
  }

  const unsub = sdk.event.on("pty.exited", (event: { properties: { id: string } }) => {
    removeExited(event.properties.id)
  })
  onCleanup(unsub)

  let reconciled = false
  createEffect(
    on(
      persistedReady,
      async (isReady) => {
        if (!isReady || reconciled) return
        reconciled = true

        const snapshot = store.all.slice()
        if (snapshot.length === 0) {
          setServerReady(true)
          return
        }

        try {
          const listed = await sdk.client.pty.list()
          const remote = new Set((listed.data ?? []).map((pty) => pty.id))
          const replacements = new Map<string, string>()

          for (const pty of snapshot) {
            if (remote.has(pty.id)) continue
            const created = await sdk.client.pty.create({ title: pty.title }).catch((error: unknown) => {
              console.error("Failed to recreate stale terminal", error)
              return undefined
            })
            const id = created?.data?.id
            if (id) replacements.set(pty.id, id)
          }

          if (replacements.size > 0) {
            batch(() => {
              setStore(
                "all",
                snapshot.map((pty) => {
                  const id = replacements.get(pty.id)
                  if (!id) return pty
                  return {
                    id,
                    title: pty.title,
                    titleNumber: pty.titleNumber,
                  }
                }),
              )
              if (store.active) setStore("active", replacements.get(store.active) ?? store.active)
              if (store.focusedPane) setStore("focusedPane", replacements.get(store.focusedPane) ?? store.focusedPane)
              setStore("paneTree", replacePaneIds(store.paneTree, replacements))
            })
          }
        } catch (error) {
          console.error("Failed to reconcile terminals", error)
        } finally {
          setServerReady(true)
        }
      },
      { defer: false },
    ),
  )

  const update = (client: ReturnType<typeof useSDK>["client"], pty: Partial<LocalPTY> & { id: string }) => {
    const index = store.all.findIndex((x) => x.id === pty.id)
    const previous = index >= 0 ? store.all[index] : undefined
    if (index >= 0) {
      setStore("all", index, (item) => ({ ...item, ...pty }))
    }
    client.pty
      .update({
        ptyID: pty.id,
        title: pty.title,
        size: pty.cols && pty.rows ? { rows: pty.rows, cols: pty.cols } : undefined,
      })
      .catch((error: unknown) => {
        if (previous) {
          const currentIndex = store.all.findIndex((item) => item.id === pty.id)
          if (currentIndex >= 0) setStore("all", currentIndex, previous)
        }
        console.error("Failed to update terminal", error)
      })
  }

  const clone = async (client: ReturnType<typeof useSDK>["client"], id: string) => {
    const index = store.all.findIndex((x) => x.id === id)
    const pty = store.all[index]
    if (!pty) return
    const next = await client.pty
      .create({
        title: pty.title,
      })
      .catch((error: unknown) => {
        console.error("Failed to clone terminal", error)
        return undefined
      })
    if (!next?.data) return

    const active = store.active === pty.id

    batch(() => {
      setStore("all", index, {
        id: next.data.id,
        title: next.data.title ?? pty.title,
        titleNumber: pty.titleNumber,
        buffer: undefined,
        cursor: undefined,
        scrollY: undefined,
        rows: undefined,
        cols: undefined,
      })
      if (active) {
        setStore("active", next.data.id)
      }
    })
  }

  // --- Pane tree helpers ---

  // Find the split node that directly contains a leaf with the given ptyId
  const findParentSplit = (
    node: PaneNode,
    targetId: string,
    grandparent: PaneSplit | null = null,
    parentSide: "a" | "b" | null = null,
  ): { parent: PaneSplit; grandparent: PaneSplit | null; parentSide: "a" | "b" | null; leafSide: "a" | "b" } | null => {
    if (node.type === "leaf") return null
    if (node.a.type === "leaf" && node.a.ptyId === targetId)
      return { parent: node, grandparent, parentSide, leafSide: "a" }
    if (node.b.type === "leaf" && node.b.ptyId === targetId)
      return { parent: node, grandparent, parentSide, leafSide: "b" }
    return findParentSplit(node.a, targetId, node, "a") ?? findParentSplit(node.b, targetId, node, "b")
  }

  const replaceLeaf = (root: PaneNode, targetId: string, replacement: PaneNode): PaneNode => {
    if (root.type === "leaf") return root.ptyId === targetId ? replacement : root
    return {
      ...root,
      a: replaceLeaf(root.a, targetId, replacement),
      b: replaceLeaf(root.b, targetId, replacement),
    }
  }

  // Replace a split node itself with a replacement (used when collapsing a split)
  const replaceSplit = (root: PaneNode, target: PaneSplit, replacement: PaneNode): PaneNode => {
    if (root === target) return replacement
    if (root.type === "leaf") return root
    return { ...root, a: replaceSplit(root.a, target, replacement), b: replaceSplit(root.b, target, replacement) }
  }

  const leafIds = (node: PaneNode): string[] => {
    if (node.type === "leaf") return [node.ptyId]
    return [...leafIds(node.a), ...leafIds(node.b)]
  }

  return {
    ready,
    all: createMemo(() => store.all),
    active: createMemo(() => store.active),
    clear() {
      batch(() => {
        setStore("active", undefined)
        setStore("all", [])
      })
    },
    new() {
      const nextNumber = pickNextTerminalNumber()
      const name = dirBase || defaultTitle(nextNumber)

      sdk.client.pty
        .create({ title: name })
        .then((pty: { data?: { id?: string; title?: string } }) => {
          const id = pty.data?.id
          if (!id) return
          const newTerminal = {
            id,
            title: pty.data?.title ?? name,
            titleNumber: nextNumber,
          }
          setStore("all", store.all.length, newTerminal)
          setStore("active", id)
        })
        .catch((error: unknown) => {
          console.error("Failed to create terminal", error)
        })
    },
    update(pty: Partial<LocalPTY> & { id: string }) {
      update(sdk.client, pty)
    },
    trim(id: string) {
      const index = store.all.findIndex((x) => x.id === id)
      if (index === -1) return
      setStore("all", index, (pty) => trimTerminal(pty))
    },
    trimAll() {
      setStore("all", (all) => {
        const next = all.map(trimTerminal)
        if (next.every((pty, index) => pty === all[index])) return all
        return next
      })
    },
    async clone(id: string) {
      await clone(sdk.client, id)
    },
    bind() {
      const client = sdk.client
      return {
        trim(id: string) {
          const index = store.all.findIndex((x) => x.id === id)
          if (index === -1) return
          setStore("all", index, (pty) => trimTerminal(pty))
        },
        update(pty: Partial<LocalPTY> & { id: string }) {
          update(client, pty)
        },
        async clone(id: string) {
          await clone(client, id)
        },
      }
    },
    open(id: string) {
      setStore("active", id)
    },
    next() {
      const index = store.all.findIndex((x) => x.id === store.active)
      if (index === -1) return
      const nextIndex = (index + 1) % store.all.length
      setStore("active", store.all[nextIndex]?.id)
    },
    previous() {
      const index = store.all.findIndex((x) => x.id === store.active)
      if (index === -1) return
      const prevIndex = index === 0 ? store.all.length - 1 : index - 1
      setStore("active", store.all[prevIndex]?.id)
    },
    async close(id: string) {
      const index = store.all.findIndex((f) => f.id === id)
      if (index !== -1) {
        batch(() => {
          if (store.active === id) {
            const next = index > 0 ? store.all[index - 1]?.id : store.all[1]?.id
            setStore("active", next)
          }
          setStore(
            "all",
            produce((all) => {
              all.splice(index, 1)
            }),
          )
        })
      }

      await sdk.client.pty.remove({ ptyID: id }).catch((error: unknown) => {
        console.error("Failed to close terminal", error)
      })
    },
    move(id: string, to: number) {
      const index = store.all.findIndex((f) => f.id === id)
      if (index === -1) return
      setStore(
        "all",
        produce((all) => {
          all.splice(to, 0, all.splice(index, 1)[0])
        }),
      )
    },

    // --- Pane tree ---

    paneTree: createMemo(() => store.paneTree),
    focusedPane: createMemo(() => store.focusedPane ?? store.active),

    focusPane(id: string) {
      setStore("focusedPane", id)
    },

    async split(ptyId: string, direction: "h" | "v") {
      const nextNumber = pickNextTerminalNumber()
      const name = dirBase || defaultTitle(nextNumber)
      const created = await sdk.client.pty.create({ title: name }).catch((error: unknown) => {
        console.error("Failed to create terminal for split", error)
        return undefined
      })
      if (!created?.data?.id) return

      const newPty: LocalPTY = {
        id: created.data.id,
        title: created.data.title ?? name,
        titleNumber: nextNumber,
      }

      const newLeaf: PaneLeaf = { type: "leaf", ptyId: created.data.id }
      const currentLeaf: PaneLeaf = { type: "leaf", ptyId }
      const splitNode: PaneSplit = { type: "split", direction, ratio: 0.5, a: currentLeaf, b: newLeaf }

      const currentTree = store.paneTree
      const nextTree = currentTree ? replaceLeaf(currentTree, ptyId, splitNode) : splitNode

      batch(() => {
        setStore("all", store.all.length, newPty)
        setStore("paneTree", nextTree)
        setStore("focusedPane", created.data.id)
      })
    },

    unsplit(ptyId: string) {
      const tree = store.paneTree
      if (!tree) return

      const result = findParentSplit(tree, ptyId)
      if (!result) return

      const { parent, leafSide } = result
      const sibling = leafSide === "a" ? parent.b : parent.a
      const siblingIds = leafIds(sibling)

      // Replace the parent split node with its sibling (collapsing the split)
      // If the result is a single leaf, clear the pane tree (revert to single-terminal mode)
      const collapsed = tree === parent ? sibling : replaceSplit(tree, parent, sibling)
      const nextTree = collapsed.type === "leaf" ? undefined : collapsed

      batch(() => {
        setStore("paneTree", nextTree)
        if (store.focusedPane === ptyId) {
          setStore("focusedPane", siblingIds[0])
        }
        setStore("all", (all) => all.filter((p) => p.id !== ptyId))
      })

      sdk.client.pty.remove({ ptyID: ptyId }).catch((error: unknown) => {
        console.error("Failed to close split pane PTY", error)
      })
    },

    resizePane(ptyId: string, ratio: number) {
      const tree = store.paneTree
      if (!tree) return
      const result = findParentSplit(tree, ptyId)
      if (!result) return
      const { parent } = result
      const updateRatio = (node: PaneNode): PaneNode => {
        if (node.type === "leaf") return node
        if (node === parent) return { ...node, ratio: Math.min(0.9, Math.max(0.1, ratio)) }
        return { ...node, a: updateRatio(node.a), b: updateRatio(node.b) }
      }
      setStore("paneTree", updateRatio(tree))
    },
  }
}

export const {
  use: useTerminal,
  provider: TerminalProvider,
  useOptional: useTerminalOptional,
} = createSimpleContext({
  name: "Terminal",
  gate: false,
  init: () => {
    const sdk = useSDK()
    const params = useParams()
    const cache = new Map<string, TerminalCacheEntry>()

    caches.add(cache)
    onCleanup(() => caches.delete(cache))

    const disposeAll = () => {
      for (const entry of cache.values()) {
        entry.dispose()
      }
      cache.clear()
    }

    onCleanup(disposeAll)

    const prune = () => {
      while (cache.size > MAX_TERMINAL_SESSIONS) {
        const first = cache.keys().next().value
        if (!first) return
        const entry = cache.get(first)
        entry?.dispose()
        cache.delete(first)
      }
    }

    const loadWorkspace = (dir: string, legacySessionID?: string) => {
      // Terminals are workspace-scoped so tabs persist while switching sessions in the same directory.
      const key = getWorkspaceTerminalCacheKey(dir)
      const existing = cache.get(key)
      if (existing) {
        cache.delete(key)
        cache.set(key, existing)
        return existing.value
      }

      const entry = createRoot((dispose) => ({
        value: createWorkspaceTerminalSession(sdk, dir, legacySessionID),
        dispose,
      }))

      cache.set(key, entry)
      prune()
      return entry.value
    }

    const workspace = createMemo(() => loadWorkspace(params.dir!, params.id))

    createEffect(
      on(
        () => ({ dir: params.dir, id: params.id }),
        (next, prev) => {
          if (!prev?.dir) return
          if (next.dir === prev.dir && next.id === prev.id) return
          if (next.dir === prev.dir && next.id) return
          loadWorkspace(prev.dir, prev.id).trimAll()
        },
        { defer: true },
      ),
    )

    return {
      ready: () => workspace().ready(),
      all: () => workspace().all(),
      active: () => workspace().active(),
      new: () => workspace().new(),
      update: (pty: Partial<LocalPTY> & { id: string }) => workspace().update(pty),
      trim: (id: string) => workspace().trim(id),
      trimAll: () => workspace().trimAll(),
      clone: (id: string) => workspace().clone(id),
      bind: () => workspace(),
      open: (id: string) => workspace().open(id),
      close: (id: string) => workspace().close(id),
      move: (id: string, to: number) => workspace().move(id, to),
      next: () => workspace().next(),
      previous: () => workspace().previous(),
      paneTree: () => workspace().paneTree(),
      focusedPane: () => workspace().focusedPane(),
      focusPane: (id: string) => workspace().focusPane(id),
      split: (ptyId: string, direction: "h" | "v") => workspace().split(ptyId, direction),
      unsplit: (ptyId: string) => workspace().unsplit(ptyId),
      resizePane: (ptyId: string, ratio: number) => workspace().resizePane(ptyId, ratio),
    }
  },
})
