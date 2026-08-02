import { createEffect, createMemo, createResource, createSignal, For, Match, on, Show, Switch } from "solid-js"
import { DataProvider } from "@opencode-ai/ui/context"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { Markdown } from "@opencode-ai/ui/markdown"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import { sampledChecksum } from "@opencode-ai/util/encode"
import { ENTITY_COLORS } from "@/lib/entity-theme"
import { useFile } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useTrellis, useTrellisOptional } from "@/context/trellis"
import { useTrellisStoreOptional } from "@/context/trellis-store"
import { searchMentions } from "@/lib/mention-search"
import { mentionTrellisCtx } from "@/lib/mention-trellis"
import { FileEditor } from "@/pages/session/file-editor"
import { FilePreview } from "./file-preview"
import { FileThumbnail } from "./thumbnail"
import { useEntityHover, useEntityNavigate } from "./nav"
import { ext, leaf, OMIT_FACT_KEYS, pathFromId, show } from "./helpers"

const STUB = {
  session: [],
  session_status: {},
  session_diff: {},
  message: {},
  part: {},
}

type Fact = {
  a: string
  v: unknown
}

export function EntityPreview(props: { id: string; type: string | undefined }) {
  return (
    <div class="flex-1 min-h-0 overflow-hidden">
      <Switch fallback={<EntityDescriptionPreview id={props.id} />}>
        <Match when={props.type === "file"}>
          <FileEntityPreview path={pathFromId(props.id)} />
        </Match>
        <Match when={props.type === "directory"}>
          <DirectoryEntityPreview path={pathFromId(props.id)} />
        </Match>
        <Match when={props.type === "project"}>
          <ProjectEntityPreview id={props.id} />
        </Match>
      </Switch>
    </div>
  )
}

// FileEntityPreview is shared by the graph drawer (Image 2 in the spec) and
// the entity dialog. It now reuses the same FileEditor surface as the code
// view (Image 3) so markdown rendering and editing affordances — slash
// commands, mentions, embeds, undo/redo, mode toggle — stay identical across
// the two contexts. Non-text/binary fallbacks remain delegated to
// `FilePreview` (raster preview, video, csv-only viewer, etc.).
function FileEntityPreview(props: { path: string }) {
  const file = useFile()
  const sdk = useSDK()
  const sync = useSync()
  const trellis = useTrellisOptional()
  const trellisStore = useTrellisStoreOptional()
  const navigate = useEntityNavigate()

  const [error, setError] = createSignal(false)

  // Re-load whenever the underlying entity changes; useFile dedupes hits and
  // keeps a hot cache so the auto-open effect's pre-fetch usually means this
  // resolves on the first frame.
  createEffect(
    on(
      () => props.path,
      (path) => {
        if (!path) return
        setError(false)
        file
          .load(path)
          .then(() => {
            file.setMode(path, file.get(path)?.mode ?? "rich")
          })
          .catch(() => setError(true))
      },
    ),
  )

  const state = createMemo(() => file.get(props.path))
  const text = createMemo(() => file.text(props.path) ?? "")
  const editable = createMemo(() => {
    const content = state()?.content
    return content?.type === "text" && content.encoding !== "base64"
  })
  const ready = createMemo(() => Boolean(state()?.loaded) || error())

  const save = () => {
    const path = props.path
    if (!path) return
    void file.save(path)
  }

  const onCreate = async (rel: string) => {
    try {
      await sdk.client.file.write({ fileWriteInput: { path: rel, content: "", format: false } })
      const parent = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ""
      await file.tree.refresh(parent)
      if (parent) file.tree.expand(parent)
      showToast({ variant: "success", title: `Created ${rel}` })
      return rel
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast({ variant: "error", title: "Create failed", description: msg })
      return undefined
    }
  }

  return (
    <div class="h-full min-h-0">
      <Show
        when={ready()}
        fallback={
          <div class="m-3 flex items-center gap-2 rounded-md border border-border-base bg-background-base px-3 py-2 text-text-weak">
            <Spinner />
            <span class="text-12-regular">Loading file...</span>
          </div>
        }
      >
        <Show
          when={!error() && state() && editable()}
          fallback={
            // Binary or unloadable content — fall back to the read-only
            // FilePreview which knows how to handle media URLs.
            <FilePreview path={props.path} file={state()?.content} onLinkClick={(p) => navigate(`file:${p}`, "file")} />
          }
        >
          <FileEditor
            path={props.path}
            state={state()!}
            value={text()}
            active={true}
            frontmatterPanel={false}
            onChange={(value) => file.setDraft(props.path, value)}
            onSave={save}
            onMode={(value) => file.setMode(props.path, value)}
            mention={{
              search: (query) =>
                searchMentions({ query, file, sync, trellis: mentionTrellisCtx(trellis, trellisStore?.facts) }),
              fetch: async (id, type) => {
                if (type !== "file") return undefined
                await file.load(id)
                return file.text(id)
              },
              navigate: (attrs) => {
                // Routing mentions/wikilinks through useEntityNavigate keeps
                // them consistent with how the rest of the entity preview
                // handles links: in the graph drawer it walks the graph, and
                // in the entity dialog it pushes a new dialog frame.
                if (attrs.type === "file") navigate(`file:${attrs.id}`, "file")
                else navigate(attrs.id, attrs.type)
              },
              onCreate,
            }}
          />
        </Show>
      </Show>
    </div>
  )
}

function DirectoryEntityPreview(props: { path: string }) {
  const sdk = useSDK()
  const navigate = useEntityNavigate()
  const [list] = createResource(
    () => props.path,
    async (next) => {
      try {
        return (await sdk.client.file.list({ path: next })).data ?? []
      } catch {
        return []
      }
    },
    { initialValue: [] },
  )
  const items = () => list.latest ?? []
  return (
    <div class="h-full overflow-y-auto p-3">
      <Show
        when={!list.loading}
        fallback={
          <div class="flex items-center gap-2 rounded-md border border-border-base bg-background-base px-3 py-2 text-text-weak">
            <Spinner />
            <span class="text-12-regular">Loading directory...</span>
          </div>
        }
      >
        <Show
          when={items().length > 0}
          fallback={
            <div class="rounded-md border border-border-base bg-background-base px-3 py-2 text-12-regular text-text-weak">
              Empty directory
            </div>
          }
        >
          <div class="grid grid-cols-2 gap-2">
            <For each={items()}>
              {(item) => {
                const type = item.type === "directory" ? ("directory" as const) : ("file" as const)
                const id = type === "directory" ? `dir:${item.path}` : `file:${item.path}`
                return <ChildCard id={id} path={item.path} type={type} onOpen={() => navigate(id, item.type)} />
              }}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  )
}

function ChildCard(props: { id: string; path: string; type: "file" | "directory"; onOpen: () => void }) {
  const extLabel = createMemo(() => (props.type === "file" ? ext(props.path) : "dir"))
  // Type-based accent color — teal for files, amber for directories. Matches
  // the graph node color palette so cards and nodes feel like the same object.
  const accent = createMemo(() => ENTITY_COLORS[props.type] ?? "var(--border-base)")
  // Optional hover channel — used by the graph view to highlight the matching
  // node when the user hovers a card. No-op in any context that doesn't provide it.
  const hover = useEntityHover()
  return (
    <button
      class="entity-child-card group relative flex flex-col overflow-hidden rounded-md border border-border-base/60 bg-background-base text-left transition-colors hover:border-border-base hover:bg-surface-raised-base/40"
      style={{ "--accent": accent() }}
      onClick={props.onOpen}
      onMouseEnter={() => hover?.(props.id)}
      onMouseLeave={() => hover?.(null)}
    >
      {/* Left-edge color stripe — subtle at rest, brighter on hover. */}
      {/* <span
        aria-hidden="true"
        class="absolute inset-y-0 left-0 w-[2px] opacity-60 transition-opacity group-hover:opacity-100"
        style={{ background: accent() }}
      /> */}
      <div class="relative h-20 w-full bg-surface-raised-base/30 border-b border-border-weaker-base">
        <FileThumbnail path={props.path} type={props.type} class="absolute inset-0" />
      </div>
      <div class="flex items-center gap-1.5 px-2 py-1.5 min-w-0">
        <FileIcon node={{ path: props.path, type: props.type }} class="shrink-0 size-3.5" aria-hidden="true" />
        <span class="truncate flex-1 text-11-medium text-text-strong" title={props.path}>
          {leaf(props.path)}
        </span>
        <Show when={extLabel()}>
          <span
            class="shrink-0 rounded-sm px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide"
            style={{
              background: `color-mix(in srgb, ${accent()} 18%, transparent)`,
              color: accent(),
            }}
          >
            {extLabel()}
          </span>
        </Show>
      </div>
    </button>
  )
}

function ProjectEntityPreview(props: { id: string }) {
  const sdk = useSDK()
  const trellis = useTrellis()

  const [graph] = createResource(
    () => props.id,
    async () => {
      try {
        return await trellis.fetchGraph()
      } catch {
        return undefined
      }
    },
    { initialValue: undefined },
  )

  const [readme] = createResource(
    async () => {
      const names = ["README.md", "readme.md", "README.markdown", "Readme.md"]
      for (const name of names) {
        try {
          const data = (await sdk.client.file.read({ path: name })).data
          if (data && data.type === "text" && data.encoding !== "base64") {
            return { path: name, data }
          }
        } catch {}
      }
      return undefined
    },
    { initialValue: undefined },
  )

  const data = () => graph.latest
  const doc = () => readme.latest
  const stats = createMemo(() => {
    const current = data()
    if (!current) return []
    const counts: Record<string, number> = {}
    for (const node of current.nodes) {
      counts[node.type] = (counts[node.type] ?? 0) + 1
    }
    const order = [
      "file",
      "directory",
      "issue",
      "agent",
      "workunit",
      "cycle",
      "epic",
      "roadmap",
      "memory",
      "sprite",
      "suggestion",
      "mcp",
    ]
    return order
      .filter((k) => (counts[k] ?? 0) > 0)
      .map((k) => ({ label: k === "directory" ? "dirs" : k === "workunit" ? "tasks" : `${k}s`, value: counts[k] }))
      .concat(current.hiddenNodes > 0 ? [{ label: "hidden", value: current.hiddenNodes }] : [])
  })

  return (
    <div class="h-full overflow-y-auto p-3 flex flex-col gap-3">
      <Show when={!graph.loading} fallback={<InlineSpinner label="Loading stats..." />}>
        <Show when={stats().length > 0}>
          <div class="grid grid-cols-4 gap-1.5">
            <For each={stats()}>
              {(stat) => (
                <div class="flex flex-col rounded-md border border-border-base/60 bg-background-base px-2.5 py-2">
                  <span class="text-14-semibold text-text-strong tabular-nums leading-none">{stat.value}</span>
                  <span class="mt-1 text-10-medium uppercase tracking-wide text-text-weaker">{stat.label}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={!readme.loading} fallback={<InlineSpinner label="Loading README..." />}>
        <Show
          when={doc()}
          fallback={
            <div class="rounded-md border border-border-base bg-background-base px-3 py-3 text-12-regular text-text-weak text-center">
              No README.md at project root
            </div>
          }
        >
          {(found) => (
            <div class="rounded-md border border-border-base/60 bg-background-base overflow-hidden">
              <div class="flex items-center gap-1.5 border-b border-border-weaker-base px-2.5 py-1.5">
                <Icon name="file-text" size="small" class="text-icon-weak" />
                <span class="font-mono text-10-medium text-text-weak">{found().path}</span>
              </div>
              <FilePreview path={found().path} file={found().data} />
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}

function InlineSpinner(props: { label: string }) {
  return (
    <div class="flex items-center gap-2 rounded-md border border-border-base bg-background-base px-3 py-2 text-text-weak">
      <Spinner />
      <span class="text-12-regular">{props.label}</span>
    </div>
  )
}

function EntityDescriptionPreview(props: { id: string }) {
  const sdk = useSDK()
  const trellis = useTrellis()
  const [ent] = createResource(
    () => props.id,
    async (next) => {
      try {
        return await trellis.fetchEntity(next)
      } catch {
        return undefined
      }
    },
    { initialValue: undefined },
  )
  const description = createMemo(() => {
    const e = ent.latest
    if (!e) return undefined
    const keys = ["body", "description", "purpose", "summary", "message", "title", "name"]
    for (const k of keys) {
      const fact = e.facts.find((f) => f.a === k)
      if (fact) return show(fact.v)
    }
    return undefined
  })
  const sum = createMemo(() => sampledChecksum(description() ?? ""))
  const otherFacts = createMemo(() => (ent.latest?.facts ?? []).filter((f) => !OMIT_FACT_KEYS.has(f.a)))
  return (
    <div class="h-full overflow-y-auto p-3">
      <Show when={ent.loading}>
        <div class="flex items-center gap-2 text-text-weak">
          <Spinner />
          <span class="text-12-regular">Loading...</span>
        </div>
      </Show>
      <Show when={!ent.loading}>
        <Show
          when={description()}
          fallback={
            <Show
              when={otherFacts().length > 0}
              fallback={
                <div class="rounded-md border border-border-base bg-background-base px-3 py-4 text-12-regular text-text-weak text-center">
                  No preview available
                </div>
              }
            >
              <FactPreview facts={otherFacts()} />
            </Show>
          }
        >
          {(text) => (
            <div class="flex flex-col gap-3">
              <Show when={otherFacts().length > 0}>
                <div class="grid grid-cols-2 gap-2">
                  <For each={otherFacts().slice(0, 24)}>
                    {(fact) => (
                      <div class="rounded-md border border-border-base/60 bg-background-base px-2.5 py-1.5">
                        <div class="text-10-medium uppercase tracking-wide text-text-weaker">{fact.a}</div>
                        <div class="mt-0.5 text-11-regular text-text-strong truncate" title={show(fact.v)}>
                          {show(fact.v)}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <DataProvider data={STUB} directory={sdk.directory} mediaUrl={sdk.url}>
                <Markdown text={text()} cacheKey={sum()} />
              </DataProvider>
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}

function FactPreview(props: { facts: Fact[] }) {
  const rows = () => props.facts.slice(0, 32)
  return (
    <div class="overflow-hidden rounded-md border border-border-base/60 bg-subtle">
      <table class="w-full border-collapse text-left">
        <tbody>
          <For each={rows()}>
            {(fact) => (
              <tr class="border-b border-border-weaker-base last:border-b-0">
                <td class="w-36 align-top px-3 py-2 text-10-medium uppercase tracking-wide text-text-weaker">
                  {fact.a}
                </td>
                <td class="align-top px-3 py-2 text-12-regular text-text-strong">
                  <span class="line-clamp-3 break-words" title={show(fact.v)}>
                    {show(fact.v)}
                  </span>
                </td>
              </tr>
            )}
          </For>
          <Show when={props.facts.length > rows().length}>
            <tr>
              <td colSpan={2} class="px-3 py-2 text-11-regular text-text-weaker">
                {props.facts.length - rows().length} more properties in Details
              </td>
            </tr>
          </Show>
        </tbody>
      </table>
    </div>
  )
}
