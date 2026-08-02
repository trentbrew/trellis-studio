import { createSimpleContext } from "@opencode-ai/ui/context"
import { createEffect, createMemo, onCleanup, type ParentProps } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { showToast } from "@opencode-ai/ui/toast"
import { useSDK } from "./sdk"
import { useServer } from "./server"
import { trellisUrl } from "./trellis"
import { isCloudMode } from "@/lib/cloud-mode"
import { emitStudioTelemetry } from "@/lib/studio-telemetry"
import type { Fetcher } from "@/utils/server"
import { droppedStoreFactsMessage, sanitizeStoreFacts } from "@/components/cms/store-facts"
import { apiErrorMessage } from "@/lib/api-error"
import { isEditableTarget } from "@/lib/editable-target"

export type StoreStats = {
  totalFacts: number
  totalLinks: number
  uniqueEntities: number
  uniqueAttributes: number
  catalogEntries: number
}

export type CatalogEntry = {
  attribute: string
  type: "string" | "number" | "boolean" | "date" | "mixed"
  cardinality: "one" | "many"
  distinctCount: number
  examples: (string | number | boolean)[]
  min?: number
  max?: number
}

export type StoreFact = {
  e: string
  a: string
  v: string | number | boolean
}

export type StoreLink = {
  e1: string
  a: string
  e2: string
}

type StoreMeta = {
  actor: string
  actorKind: "user"
  source: string
  relatedEntities: string[]
}

export type StoreEntity = {
  id: string
  type: string
}

export type EntityDetail = {
  id: string
  facts: StoreFact[]
  links: StoreLink[]
}

type State = {
  ready: boolean
  loading: boolean
  hydrated: boolean
  error?: string
  revision: number
  sig?: string
  stats?: StoreStats
  catalog: CatalogEntry[]
  entities: StoreEntity[]
  selected?: EntityDetail
  facts: StoreFact[]
  links: StoreLink[]
  fresh: string[]
}

const PAGE = 1000
const FACT_PAGE = PAGE
const LARGE_FACT_THRESHOLD = 50_000
const LARGE_LINK_THRESHOLD = 10_000

async function safeJson<T>(res: Response): Promise<T | undefined> {
  try {
    return (await res.json()) as T
  } catch {
    return undefined
  }
}

async function get<T>(run: Fetcher, url: string, dir: string, path: string, sig?: AbortSignal): Promise<T | undefined> {
  const match = path.match(/^\/store\/entity\/(.+)$/)
  if (match) {
    const id = decodeURIComponent(match[1])
    if (id.startsWith("project:")) {
      return { id, facts: [], links: [] } as T
    }
  }

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 30_000)
  const stop = () => ctrl.abort()
  sig?.addEventListener("abort", stop, { once: true })
  try {
    const res = await run(trellisUrl(url, dir, path), { signal: ctrl.signal })
    if (!res.ok) return undefined
    return safeJson<T>(res)
  } catch {
    return undefined
  } finally {
    clearTimeout(t)
    sig?.removeEventListener("abort", stop)
  }
}

async function entities(run: Fetcher, url: string, dir: string, sig?: AbortSignal): Promise<StoreEntity[] | undefined> {
  const out: StoreEntity[] = []
  for (let offset = 0; ; offset += PAGE) {
    const page = await get<StoreEntity[]>(run, url, dir, `/store/entities?limit=${PAGE}&offset=${offset}`, sig)
    if (!page) return out.length > 0 ? out : undefined
    out.push(...page)
    if (page.length < PAGE) return out
  }
}

async function facts(run: Fetcher, url: string, dir: string, sig?: AbortSignal): Promise<StoreFact[] | undefined> {
  const out: StoreFact[] = []
  for (let offset = 0; ; offset += FACT_PAGE) {
    const page = await get<StoreFact[]>(run, url, dir, `/store/facts?limit=${FACT_PAGE}&offset=${offset}`, sig)
    if (!page) return out.length > 0 ? out : undefined
    out.push(...page)
    if (page.length < FACT_PAGE) return out
  }
}

function signature(
  stats: StoreStats | undefined,
  list: StoreEntity[] | undefined,
  facts: StoreFact[] | undefined,
  links: StoreLink[] | undefined,
) {
  return JSON.stringify({
    stats,
    entities: list?.map((e) => [e.id, e.type]),
    facts,
    links,
  })
}

function statsKey(stats: StoreStats | undefined) {
  return stats ? JSON.stringify(stats) : undefined
}

function largeStore(stats: StoreStats | undefined) {
  return !!stats && (stats.totalFacts > LARGE_FACT_THRESHOLD || stats.totalLinks > LARGE_LINK_THRESHOLD)
}

type RefreshOpts = {
  toast?: boolean
  force?: boolean
  catalog?: boolean
  hydrate?: boolean
}

type RefreshKind = "full" | "stats-only-large" | "stats-only-skip" | "stats-then-full"

function reportStoreRefresh(input: {
  kind: RefreshKind
  durationMs: number
  cloud: boolean
  factCount: number
  entityCount: number
  catalogLoaded: boolean
}) {
  emitStudioTelemetry(
    "studio.store.refresh",
    {
      kind: input.kind,
      durationMs: input.durationMs,
      cloud: input.cloud,
      factCount: input.factCount,
      entityCount: input.entityCount,
      catalogLoaded: input.catalogLoaded,
    },
    { throttleKey: "studio.store.refresh" },
  )
}

let lastStoreError: string | undefined

export function lastTrellisStoreError() {
  return lastStoreError
}

async function post<T>(run: Fetcher, url: string, dir: string, path: string, body: unknown): Promise<T | undefined> {
  lastStoreError = undefined
  try {
    const res = await run(trellisUrl(url, dir, path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await safeJson(res)
      lastStoreError = apiErrorMessage(err, `${path} failed (${res.status})`)
      console.error(`[trellis-store] ${path} failed (${res.status})`, err)
      return undefined
    }
    return safeJson<T>(res)
  } catch (err) {
    lastStoreError = err instanceof Error ? err.message : String(err)
    console.error(`[trellis-store] ${path} failed`, err)
    return undefined
  }
}

function factMeta(list: StoreFact[]) {
  const relatedEntities = [
    ...new Set(list.map((item) => item.e).filter((id): id is string => typeof id === "string" && id.length > 0)),
  ]
  return {
    actor: "user:local",
    actorKind: "user" as const,
    source: "trellis-store-ui",
    relatedEntities,
  } satisfies StoreMeta
}

function linkMeta(list: StoreLink[]) {
  return {
    actor: "user:local",
    actorKind: "user" as const,
    source: "trellis-store-ui",
    relatedEntities: [...new Set(list.flatMap((item) => [item.e1, item.e2]))],
  } satisfies StoreMeta
}

const ctx = createSimpleContext({
  name: "TrellisStore",
  gate: false,
  init: () => {
    const sdk = useSDK()
    const server = useServer()
    const [state, set] = createStore<State>({
      ready: false,
      loading: false,
      hydrated: false,
      revision: 0,
      catalog: [],
      entities: [],
      facts: [],
      links: [],
      fresh: [],
    })

    const url = createMemo(() => sdk.url)
    const dir = createMemo(() => sdk.directory)
    const run = sdk.fetch
    const abort = new AbortController()
    let seeded = false
    let hold: ReturnType<typeof setTimeout> | undefined
    let busy = false
    let pendingRefresh: RefreshOpts | undefined
    let lastStatsKey: string | undefined
    let catalogLoaded = false
    const cloud = isCloudMode()

    const fresh = (list: StoreEntity[] | undefined, toast: boolean) => {
      if (!list) return
      const before = new Set(state.entities.map((e) => e.id))
      const added = seeded ? list.filter((e) => !before.has(e.id)) : []
      seeded = true
      if (added.length === 0) return
      if (hold) clearTimeout(hold)
      set(
        "fresh",
        added.map((e) => e.id),
      )
      hold = setTimeout(() => set("fresh", []), 6_000)
      if (toast) {
        const types = new Map<string, number>()
        for (const item of added) types.set(item.type, (types.get(item.type) ?? 0) + 1)
        showToast({
          variant: "success",
          title: added.length === 1 ? `Added ${added[0].type}` : `Added ${added.length} entities`,
          description: [...types.entries()].map(([type, count]) => `${count} ${type}`).join(" · "),
        })
      }
    }

    const refresh = async (opts: RefreshOpts | boolean = {}) => {
      if (server.healthy() === false) return
      const options: RefreshOpts = typeof opts === "boolean" ? { toast: opts } : opts
      const toast = options.toast ?? true
      const force = options.force ?? false
      const loadCatalog = options.catalog ?? false
      const started = performance.now()
      let kind: RefreshKind = force || !state.ready ? "full" : "stats-then-full"
      let factCount = state.facts.length
      let entityCount = state.entities.length

      if (busy) {
        pendingRefresh = options
        return
      }
      busy = true
      if (!state.ready || options.hydrate) set("loading", true)
      try {
        const stats = await get<StoreStats>(run, url(), dir(), "/store/stats", abort.signal)
        const key = statsKey(stats)
        const previousKey = lastStatsKey
        if (stats) {
          set("stats", reconcile(stats))
          lastStatsKey = key
        }
        const large = largeStore(stats)
        const hydrate = options.hydrate ?? (!large && (force || !state.ready || state.hydrated))
        if (!force && state.ready && key && key === previousKey && !hydrate) {
          kind = "stats-only-skip"
          return
        }
        if (!hydrate) {
          kind = large ? "stats-only-large" : "stats-only-skip"
          const sig = signature(stats, undefined, undefined, undefined)
          if (sig !== state.sig) {
            set("sig", sig)
            set("revision", state.revision + 1)
          }
          set("error", undefined)
          return
        }

        // Load entities, facts, and links together. Catalog is the
        // heaviest endpoint (full attribute scan) and is not needed for CMS
        // rendering, so it loads once (or on explicit request) in the background.
        const [list, allFacts, links] = await Promise.all([
          entities(run, url(), dir(), abort.signal),
          facts(run, url(), dir(), abort.signal),
          get<StoreLink[]>(run, url(), dir(), "/store/links", abort.signal),
        ])
        fresh(list, toast)
        if (list) set("entities", reconcile(list, { key: "id" }))
        if (allFacts) set("facts", reconcile(allFacts))
        if (links) set("links", reconcile(links))
        if (list && allFacts && links) set("hydrated", true)
        factCount = allFacts?.length ?? factCount
        entityCount = list?.length ?? entityCount
        const sig = signature(stats, list, allFacts, links)
        if (sig !== state.sig) {
          set("sig", sig)
          set("revision", state.revision + 1)
        }
        set("error", undefined)
        if (!large && (loadCatalog || (!catalogLoaded && !cloud))) {
          catalogLoaded = true
          get<CatalogEntry[]>(run, url(), dir(), "/store/catalog", abort.signal).then((catalog) => {
            if (catalog) set("catalog", reconcile(catalog))
          })
        }
      } catch (err) {
        set("error", err instanceof Error ? err.message : String(err))
      } finally {
        reportStoreRefresh({
          kind,
          durationMs: Math.round(performance.now() - started),
          cloud,
          factCount,
          entityCount,
          catalogLoaded,
        })
        // Always mark ready so the UI can exit the loading state, even when the
        // backend is unreachable or missing /trellis/store routes.
        set("ready", true)
        set("loading", false)
        busy = false
        if (pendingRefresh !== undefined) {
          const next = pendingRefresh
          pendingRefresh = undefined
          void refresh(next)
        }
      }
    }

    const select = async (id: string) => {
      const detail = await get<EntityDetail>(run, url(), dir(), `/store/entity/${encodeURIComponent(id)}`)
      if (detail) set("selected", reconcile(detail))
    }

    const deselect = () => set("selected", undefined)

    const query = async (opts: { attribute?: string; value?: string; limit?: number }) => {
      const params = new URLSearchParams()
      params.set("directory", dir())
      if (opts.attribute) params.set("attribute", opts.attribute)
      if (opts.value) params.set("value", opts.value)
      if (opts.limit) params.set("limit", String(opts.limit))
      try {
        const res = await run(`${url()}/trellis/store/facts?${params}`)
        if (!res.ok) return
        const facts = await safeJson<StoreFact[]>(res)
        if (facts) set("facts", reconcile(facts))
      } catch {
        // ignore network/parse failures
      }
    }

    const queryLinks = async (opts: { entity?: string; attribute?: string }) => {
      const params = new URLSearchParams()
      params.set("directory", dir())
      if (opts.entity) params.set("entity", opts.entity)
      if (opts.attribute) params.set("attribute", opts.attribute)
      try {
        const res = await run(`${url()}/trellis/store/links?${params}`)
        if (!res.ok) return
        const links = await safeJson<StoreLink[]>(res)
        if (links) set("links", reconcile(links))
      } catch {
        // ignore network/parse failures
      }
    }

    const hydrate = async (opts: RefreshOpts = {}) => {
      await refresh({ ...opts, force: true, hydrate: true, toast: opts.toast ?? false })
    }

    const assert = async (facts: StoreFact[]) => {
      const payload = sanitizeStoreFacts(facts)
      const dropped = droppedStoreFactsMessage(facts.length, payload.length)
      if (dropped) {
        lastStoreError = dropped
        return undefined
      }
      if (payload.length === 0) return { added: 0 }
      const result = await post<{ added: number }>(run, url(), dir(), "/store/assert", {
        facts: payload,
        meta: factMeta(payload),
      })
      if (result) await refresh({ force: true, hydrate: state.hydrated, toast: false })
      return result
    }

    const retract = async (facts: StoreFact[]) => {
      const payload = sanitizeStoreFacts(facts)
      if (payload.length === 0) return { removed: 0 }
      const result = await post<{ removed: number }>(run, url(), dir(), "/store/retract", {
        facts: payload,
        meta: factMeta(payload),
      })
      if (result) await refresh({ force: true, hydrate: state.hydrated, toast: false })
      return result
    }

    const link = async (links: StoreLink[]) => {
      const result = await post<{ added: number }>(run, url(), dir(), "/store/link", { links, meta: linkMeta(links) })
      if (result) await refresh({ force: true, hydrate: state.hydrated, toast: false })
      return result
    }

    const unlink = async (links: StoreLink[]) => {
      const result = await post<{ removed: number }>(run, url(), dir(), "/store/unlink", {
        links,
        meta: linkMeta(links),
      })
      if (result) await refresh({ force: true, hydrate: state.hydrated, toast: false })
      return result
    }

    const handler = (event: Event) => {
      const quiet = event instanceof CustomEvent && event.detail && event.detail.quiet === true
      void refresh({ force: true, hydrate: state.hydrated, toast: !quiet, catalog: true })
    }
    if (typeof window !== "undefined") window.addEventListener("trellis-store-changed", handler)

    let timer: ReturnType<typeof setInterval> | undefined
    let onVisible: (() => void) | undefined
    if (typeof window !== "undefined" && cloud) {
      onVisible = () => {
        if (document.visibilityState === "visible") void refresh({ toast: false })
      }
      document.addEventListener("visibilitychange", onVisible)
    }

    createEffect(() => {
      url()
      dir()
      if (server.healthy() === false) return

      void refresh({ catalog: true })

      if (cloud) return

      timer = setInterval(() => {
        if (server.healthy() === false) return
        if (isEditableTarget(document.activeElement)) return
        void refresh({ toast: false })
      }, 5_000)

      onCleanup(() => {
        if (timer) clearInterval(timer)
        timer = undefined
      })
    })

    onCleanup(() => {
      abort.abort()
      busy = false
      if (timer) clearInterval(timer)
      if (onVisible) document.removeEventListener("visibilitychange", onVisible)
      if (hold) clearTimeout(hold)
      if (typeof window !== "undefined") window.removeEventListener("trellis-store-changed", handler)
    })

    return {
      get ready() {
        return state.ready
      },
      get loading() {
        return state.loading
      },
      get hydrated() {
        return state.hydrated
      },
      get large() {
        return largeStore(state.stats)
      },
      get error() {
        return state.error
      },
      get revision() {
        return state.revision
      },
      get stats() {
        return state.stats
      },
      get catalog() {
        return state.catalog
      },
      get entities() {
        return state.entities
      },
      get selected() {
        return state.selected
      },
      get facts() {
        return state.facts
      },
      get links() {
        return state.links
      },
      get fresh() {
        return state.fresh
      },
      refresh,
      hydrate,
      select,
      deselect,
      query,
      queryLinks,
      assert,
      retract,
      link,
      unlink,
    }
  },
})

export const useTrellisStore = ctx.use
export const useTrellisStoreOptional = ctx.useOptional
export const TrellisStoreProvider = ctx.provider

export function TrellisStoreScope(props: ParentProps) {
  const store = useTrellisStoreOptional()
  if (store) return <>{props.children}</>
  return <TrellisStoreProvider>{props.children}</TrellisStoreProvider>
}
