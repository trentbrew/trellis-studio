import { batch, createMemo, onCleanup, onMount, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { same } from "@/utils/same"

const emptyTabs: string[] = []

type Tabs = {
  active: Accessor<string | undefined>
  all: Accessor<string[]>
}

type TabsInput = {
  tabs: Accessor<Tabs>
  pathFromTab: (tab: string) => string | undefined
  normalizeTab: (tab: string) => string
  review?: Accessor<boolean>
  hasReview?: Accessor<boolean>
}

export const getSessionKey = (dir: string | undefined, id: string | undefined) => `${dir ?? ""}${id ? `/${id}` : ""}`

/** Layout tabs/view persistence key (workspace-wide, not per agent session). */
export const getWorkspaceKey = (dir: string | undefined) => dir ?? ""

export const topTabs = [
  "home",
  "plan",
  "logs",
  "explore",
  "graph",
  "browser",
  "code",
  "preview",
  "data",
  "assets",
  "design",
  "review",
  "ship",
  "cms",
  "projection",
] as const
export type TopTab = (typeof topTabs)[number]

/** Map `?view=` search param to the active session rail tab. */
/** Dropped when switching agent sessions — not workspace UI state. */
const SESSION_ROUTE_EPHEMERAL_KEYS = new Set(["prompt", "new"])

export type SessionRouteSearch = string | URLSearchParams | Record<string, string | string[] | undefined>

function workspaceSearchParams(search?: SessionRouteSearch): URLSearchParams {
  if (search instanceof URLSearchParams) {
    const query = new URLSearchParams(search)
    for (const key of SESSION_ROUTE_EPHEMERAL_KEYS) query.delete(key)
    return query
  }

  if (typeof search === "string") {
    const query = new URLSearchParams(search)
    for (const key of SESSION_ROUTE_EPHEMERAL_KEYS) query.delete(key)
    return query
  }

  if (search && typeof search === "object") {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(search)) {
      if (value == null || SESSION_ROUTE_EPHEMERAL_KEYS.has(key)) continue
      if (Array.isArray(value)) {
        for (const entry of value) query.append(key, entry)
      } else {
        query.set(key, value)
      }
    }
    return query
  }

  const query = new URLSearchParams(typeof location === "object" ? location.search : "")
  for (const key of SESSION_ROUTE_EPHEMERAL_KEYS) query.delete(key)
  return query
}

/** Preserves `?view=`, `?lens=`, and other workspace affordance params across session changes. */
export function workspaceSearchSuffix(search?: SessionRouteSearch): string {
  const suffix = workspaceSearchParams(search).toString()
  return suffix ? `?${suffix}` : ""
}

export function sessionRouteHref(dir: string, sessionID?: string, search?: SessionRouteSearch): string {
  const path = sessionID ? `/${dir}/session/${sessionID}` : `/${dir}/session`
  return `${path}${workspaceSearchSuffix(search)}`
}

export function routeTabFromSearchParams(view: string | string[] | undefined): TopTab {
  const v = Array.isArray(view) ? view[0] : view
  if (v === "projection") return "projection"
  if (v === "home") return "graph"
  if (v === "graph") return "graph"
  if (v === "plan") return "plan"
  if (v === "preview") return "browser"
  if (v === "browser") return "browser"
  if (v === "code") return "code"
  if (v === "data") return "graph"
  if (v === "logs" || v === "explore") return "logs"
  if (v === "review") return "review"
  if (v === "cms") return "cms"
  if (v === "assets") return "assets"
  if (v === "design") return "design"
  return "graph"
}

export const createSessionTabs = (input: TabsInput) => {
  const review = input.review ?? (() => false)
  const hasReview = input.hasReview ?? (() => false)
  const contextOpen = createMemo(() => input.tabs().active() === "context" || input.tabs().all().includes("context"))
  const openedTabs = createMemo(
    () => {
      const seen = new Set<string>()
      return input
        .tabs()
        .all()
        .flatMap((tab) => {
          if (
            tab === "context" ||
            tab === "review" ||
            tab === "home" ||
            tab === "graph" ||
            tab === "plan" ||
            tab === "logs" ||
            tab === "explore" ||
            tab === "preview" ||
            tab === "ship" ||
            tab === "cms"
          )
            return []
          const value = input.pathFromTab(tab) ? input.normalizeTab(tab) : tab
          if (seen.has(value)) return []
          seen.add(value)
          return [value]
        })
    },
    emptyTabs,
    { equals: same },
  )
  const activeTab = createMemo(() => {
    const active = input.tabs().active()
    if (active === "context") return active
    if (
      active === "home" ||
      active === "plan" ||
      active === "logs" ||
      active === "explore" ||
      active === "graph" ||
      active === "preview" ||
      active === "review" ||
      active === "ship" ||
      active === "cms" ||
      active === "design"
    )
      return active
    if (active === "review" && review()) return active
    if (active && input.pathFromTab(active)) return input.normalizeTab(active)

    const first = openedTabs()[0]
    if (first) return first
    if (contextOpen()) return "context"
    if (review() && hasReview()) return "review"
    return "empty"
  })
  const activeTopTab = createMemo((): TopTab => {
    const active = activeTab()
    if (active === "home") return "home"
    if (active === "plan") return "plan"
    if (active === "logs" || active === "explore") return "logs"
    if (active === "browser") return "browser"
    if (active === "preview") return "preview"
    if (active === "data") return "data"
    if (active === "assets") return "assets"
    if (active === "design") return "design"
    if (active === "review") return "review"
    if (active === "ship") return "ship"
    if (active === "cms") return "cms"
    return "code"
  })
  const activeFileTab = createMemo(() => {
    const active = activeTab()
    if (!openedTabs().includes(active)) return
    return active
  })
  const closableTab = createMemo(() => {
    const active = activeTab()
    if (active === "context") return active
    if (
      active === "home" ||
      active === "plan" ||
      active === "logs" ||
      active === "explore" ||
      active === "graph" ||
      active === "preview" ||
      active === "data" ||
      active === "assets" ||
      active === "ship" ||
      active === "cms" ||
      active === "design"
    )
      return undefined
    if (!openedTabs().includes(active)) return
    return active
  })

  return {
    contextOpen,
    openedTabs,
    activeTab,
    activeTopTab,
    activeFileTab,
    closableTab,
  }
}

export const focusTerminalById = (id: string) => {
  const wrapper = document.getElementById(`terminal-wrapper-${id}`)
  const terminal = wrapper?.querySelector('[data-component="terminal"]')
  if (!(terminal instanceof HTMLElement)) return false

  const textarea = terminal.querySelector("textarea")
  if (textarea instanceof HTMLTextAreaElement) {
    textarea.focus()
    return true
  }

  terminal.focus()
  terminal.dispatchEvent(
    typeof PointerEvent === "function"
      ? new PointerEvent("pointerdown", { bubbles: true, cancelable: true })
      : new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
  )
  return true
}

const skip = new Set(["Alt", "Control", "Meta", "Shift"])

export const shouldFocusTerminalOnKeyDown = (event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">) => {
  if (skip.has(event.key)) return false
  return !(event.ctrlKey || event.metaKey || event.altKey)
}

export const createOpenReviewFile = (input: {
  showAllFiles: () => void
  tabForPath: (path: string) => string
  openTab: (tab: string) => void
  setActive: (tab: string) => void
  loadFile: (path: string) => any | Promise<void>
}) => {
  return (path: string) => {
    batch(() => {
      input.showAllFiles()
      const maybePromise = input.loadFile(path)
      const open = () => {
        const tab = input.tabForPath(path)
        input.openTab(tab)
        input.setActive(tab)
      }
      if (maybePromise instanceof Promise) maybePromise.then(open)
      else open()
    })
  }
}

export const createOpenSessionFileTab = (input: {
  normalizeTab: (tab: string) => string
  openTab: (tab: string) => void
  pathFromTab: (tab: string) => string | undefined
  loadFile: (path: string) => void
  openReviewPanel: () => void
  setActive: (tab: string) => void
}) => {
  return (value: string) => {
    const next = input.normalizeTab(value)
    input.openTab(next)

    const path = input.pathFromTab(next)
    if (!path) return

    input.loadFile(path)
    input.openReviewPanel()
    input.setActive(next)
  }
}

export const getTabReorderIndex = (tabs: readonly string[], from: string, to: string) => {
  const fromIndex = tabs.indexOf(from)
  const toIndex = tabs.indexOf(to)
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return undefined
  return toIndex
}

export const reorderIds = (ids: readonly string[], from: string, to: string) => {
  const fromIndex = ids.indexOf(from)
  const toIndex = ids.indexOf(to)
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return ids
  const next = ids.slice()
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return ids
  next.splice(toIndex, 0, moved)
  return next
}

export const createSizing = () => {
  const [state, setState] = createStore({ active: false })
  let t: number | undefined

  const stop = () => {
    if (t !== undefined) {
      clearTimeout(t)
      t = undefined
    }
    setState("active", false)
  }

  const start = () => {
    if (t !== undefined) {
      clearTimeout(t)
      t = undefined
    }
    setState("active", true)
  }

  onMount(() => {
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    window.addEventListener("blur", stop)
    onCleanup(() => {
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
      window.removeEventListener("blur", stop)
    })
  })

  onCleanup(() => {
    if (t !== undefined) clearTimeout(t)
  })

  return {
    active: () => state.active,
    start,
    touch() {
      start()
      t = window.setTimeout(stop, 120)
    },
  }
}

export type Sizing = ReturnType<typeof createSizing>
