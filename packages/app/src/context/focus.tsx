import { createRoot, createMemo, createEffect, on, onCleanup, untrack, getOwner } from "solid-js"
import { createStore } from "solid-js/store"
import { useParams, useSearchParams } from "@solidjs/router"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { Persist, persisted } from "@/utils/persist"
import { projectionWhiteboard } from "@/lib/whiteboard/active-projection"
import { createSessionTabs, routeTabFromSearchParams } from "@/pages/session/helpers"
import { useSessionLayout } from "@/pages/session/session-layout"
import { resolveFocus, withLanePayload } from "@/lib/focus/registry"
import { readFocusRailHints } from "@/lib/focus/rail-labels"
import type { FocusContext, FocusSessionRef } from "@/lib/focus/types"

type FocusStore = {
  current?: FocusContext
  pinned?: FocusContext
  excluded: boolean
}

type Scope = {
  dir: string
  id?: string
}

const WORKSPACE_KEY = "__workspace__"
const MAX_FOCUS_SESSIONS = 20

function sessionRef(session: {
  id: string
  laneID?: string
  parentLaneID?: string
  laneForkKind?: "sibling" | "child"
  laneUnpromotedParent?: boolean
}): FocusSessionRef {
  return {
    id: session.id,
    laneID: session.laneID,
    parentLaneID: session.parentLaneID,
    laneForkKind: session.laneForkKind,
    laneUnpromotedParent: session.laneUnpromotedParent,
  }
}

function createFocusSession(dir: string, id: string | undefined) {
  const legacy = `${dir}/focus${id ? "/" + id : ""}.v0`
  const [store, setStore, _, ready] = persisted(
    Persist.scoped(dir, id, "focus", [legacy]),
    createStore<FocusStore>({ excluded: false }),
  )

  return {
    ready,
    store,
    setStore,
  }
}

export const {
  use: useFocus,
  useOptional: useFocusOptional,
  provider: FocusProvider,
} = createSimpleContext({
  name: "Focus",
  init: () => {
    const params = useParams()
    const [searchParams] = useSearchParams()
    const sdk = useSDK()
    const sync = useSync()
    const files = useFile()
    const { tabs } = useSessionLayout()
    const cache = new Map<string, { value: ReturnType<typeof createFocusSession>; dispose: VoidFunction }>()

    const routeTab = createMemo(() => routeTabFromSearchParams(searchParams.view))

    const activeFileTab = createSessionTabs({
      tabs,
      pathFromTab: files.pathFromTab,
      normalizeTab: (tab) => (tab.startsWith("file://") ? files.tab(tab) : tab),
    }).activeFileTab

    onCleanup(() => {
      for (const entry of cache.values()) entry.dispose()
      cache.clear()
    })

    const owner = getOwner()
    const load = (dir: string, id: string | undefined) => {
      const key = `${dir}:${id ?? WORKSPACE_KEY}`
      const existing = cache.get(key)
      if (existing) {
        cache.delete(key)
        cache.set(key, existing)
        return existing.value
      }
      const entry = createRoot((dispose) => ({ value: createFocusSession(dir, id), dispose }), owner)
      cache.set(key, entry)
      while (cache.size > MAX_FOCUS_SESSIONS) {
        const first = cache.keys().next().value
        if (!first) break
        cache.get(first)?.dispose()
        cache.delete(first)
      }
      return entry.value
    }

    const scoped = createMemo(() => load(params.dir!, params.id))
    const pick = (scope?: Scope) => (scope ? load(scope.dir, scope.id) : scoped())

    const session = createMemo(() => {
      const id = params.id
      if (!id) return undefined
      return sync.session.get(id)
    })

    const ambient = createMemo(() => {
      readFocusRailHints()
      const ref = session()
      return resolveFocus({
        view: routeTab(),
        activeFileTab: activeFileTab(),
        session: ref ? sessionRef(ref) : undefined,
        searchParams,
      })
    })

    const active = createMemo(() => {
      const store = scoped().store
      if (store.excluded) return undefined
      if (store.pinned) return store.pinned
      return ambient()
    })

    createEffect(
      on(
        () =>
          [
            params.id,
            routeTab(),
            searchParams.view,
            searchParams.lens,
            searchParams.section,
            searchParams.asset,
            searchParams.cmsCollection,
            searchParams.cmsEntry,
            searchParams.whiteboard,
            readFocusRailHints(),
            activeFileTab(),
            projectionWhiteboard.path(),
            session()?.laneID,
            session()?.laneForkKind,
            scoped().ready(),
          ] as const,
        () => {
          if (!params.id || !scoped().ready()) return
          const { store, setStore } = scoped()
          const next = ambient()
          if (!next) return
          if (store.pinned) {
            setStore("pinned", withLanePayload(store.pinned, session() ? sessionRef(session()!) : undefined))
            return
          }
          untrack(() => setStore("current", next))
        },
      ),
    )

    return {
      ready: () => scoped().ready(),
      active,
      ambient,
      excluded: () => scoped().store.excluded,
      pinned: () => !!scoped().store.pinned,
      setExcluded: (value: boolean) => scoped().setStore("excluded", value),
      toggleExcluded: () => scoped().setStore("excluded", (value) => !value),
      pin: () => {
        const focus = ambient() ?? scoped().store.current
        if (!focus) return
        scoped().setStore({ pinned: focus, excluded: false })
      },
      unpin: () => scoped().setStore("pinned", undefined),
      refresh: () => {
        const next = ambient()
        if (next) scoped().setStore("current", next)
      },
      cloneForFork: (parentSessionID: string, child: FocusSessionRef, scope?: Scope) => {
        const target = pick(scope)
        const parent = sync.session.get(parentSessionID)
        const base =
          target.store.pinned ??
          target.store.current ??
          resolveFocus({
            view: routeTab(),
            activeFileTab: activeFileTab(),
            session: parent ? sessionRef(parent) : undefined,
            searchParams,
          })
        const cloned: FocusContext = base
          ? withLanePayload(
              {
                ...base,
                capturedAt: new Date().toISOString(),
                pinned: undefined,
                excluded: false,
                payload: {
                  ...base.payload,
                  sessionId: child.id,
                },
              },
              child,
            )
          : withLanePayload(
              {
                version: 1,
                surface: "shell",
                label: "Session",
                key: child.id,
                summary: undefined,
                payload: { sessionId: child.id },
                capturedAt: new Date().toISOString(),
              },
              child,
            )
        target.setStore({ current: cloned, pinned: undefined, excluded: false })
      },
      forSend: () => {
        const focus = active()
        if (!focus || focus.excluded) return undefined
        return focus
      },
    }
  },
})
