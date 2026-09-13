import { createEffect, createMemo, createResource, createSignal, For, Match, on, onCleanup, onMount, Show, Switch } from "solid-js"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { showToast } from "@opencode-ai/ui/toast"
import { ENTITY_COLORS } from "@/lib/entity-theme"
import { useFileOptional, type FileState } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useTrellis } from "@/context/trellis"
import { useMentionCallbacksOptional } from "@/lib/use-mention-callbacks"
import { entityMarkdownPath, inlineBody, snippet } from "@/lib/entity-body-path"
import { FileEditor } from "@/pages/session/file-editor"
import { FilePreview } from "./file-preview"
import { FileThumbnail } from "./thumbnail"
import { useEntityHover, useEntityNavigate } from "./nav"
import { ext, leaf, OMIT_FACT_KEYS, pathFromId, show } from "./helpers"

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

// FileEntityPreview is shared by the graph drawer and entity dialog. It reuses
// the same FileEditor surface as the code view. Outside the session file
// provider, edits load and save through the SDK directly.
function FileEntityPreview(props: { path: string; frontmatterPanel?: boolean }) {
  const file = useFileOptional()
  if (!file) return <StandaloneFileEditor path={props.path} frontmatterPanel={props.frontmatterPanel} />
  return <SessionFileEditor path={props.path} frontmatterPanel={props.frontmatterPanel} />
}

function SessionFileEditor(props: { path: string; frontmatterPanel?: boolean }) {
  const file = useFileOptional()
  const sdk = useSDK()
  const mention = useMentionCallbacksOptional()
  const navigate = useEntityNavigate()

  const [error, setError] = createSignal(false)

  createEffect(
    on(
      () => props.path,
      (path) => {
        if (!path || !file) return
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

  const state = createMemo(() => file?.get(props.path))
  const text = createMemo(() => file?.text(props.path) ?? "")
  const editable = createMemo(() => {
    const content = state()?.content
    return content?.type === "text" && content.encoding !== "base64"
  })
  const ready = createMemo(() => Boolean(state()?.loaded) || error())

  const save = () => {
    const path = props.path
    if (!path || !file) return
    void file.save(path)
  }

  const onCreate = async (rel: string) => {
    try {
      await sdk.client.file.write({ fileWriteInput: { path: rel, content: "", format: false } })
      const parent = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ""
      await file?.tree.refresh(parent)
      if (parent) file?.tree.expand(parent)
      showToast({ variant: "success", title: `Created ${rel}` })
      return rel
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      showToast({ variant: "error", title: "Create failed", description: msg })
      return undefined
    }
  }

  return (
    <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
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
            <FilePreview path={props.path} file={state()?.content} onLinkClick={(p) => navigate(`file:${p}`, "file")} />
          }
        >
          <FileEditor
            path={props.path}
            state={state()!}
            value={text()}
            active={true}
            frontmatterPanel={props.frontmatterPanel}
            onChange={(value) => file?.setDraft(props.path, value)}
            onSave={save}
            onMode={(value) => file?.setMode(props.path, value)}
            mention={{ ...mention, onCreate }}
          />
        </Show>
      </Show>
    </div>
  )
}

function StandaloneFileEditor(props: { path: string; frontmatterPanel?: boolean }) {
  const sdk = useSDK()
  const mention = useMentionCallbacksOptional()
  const [error, setError] = createSignal(false)
  const [loaded, setLoaded] = createSignal(false)
  const [mode, setMode] = createSignal<"rich" | "raw">("rich")
  const [draft, setDraft] = createSignal("")
  const [saved, setSaved] = createSignal("")
  const [saving, setSaving] = createSignal(false)
  const [saveError, setSaveError] = createSignal<string>()

  createEffect(
    on(
      () => props.path,
      async (path) => {
        if (!path) return
        setError(false)
        setLoaded(false)
        const result = await sdk.client.file.read({ path }).catch(() => undefined)
        const file = result?.data
        if (!file || file.type !== "text" || file.encoding === "base64") {
          setError(true)
          return
        }
        setDraft(file.content)
        setSaved(file.content)
        setMode("rich")
        setLoaded(true)
      },
    ),
  )

  const state = createMemo(
    (): FileState => ({
      path: props.path,
      name: props.path.split("/").pop() ?? props.path,
      loaded: loaded(),
      mode: mode(),
      content: { type: "text", content: saved() },
      draft: draft() !== saved() ? draft() : undefined,
      saving: saving(),
      saveError: saveError(),
    }),
  )

  const save = async () => {
    if (saving()) return
    setSaving(true)
    setSaveError(undefined)
    try {
      await sdk.client.file.write({ fileWriteInput: { path: props.path, content: draft(), format: false } })
      setSaved(draft())
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== "s") return
      event.preventDefault()
      void save()
    }
    window.addEventListener("keydown", onKeyDown, { capture: true })
    onCleanup(() => window.removeEventListener("keydown", onKeyDown, { capture: true }))
  })

  return (
    <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Show
        when={loaded() && !error()}
        fallback={
          <div class="m-3 flex items-center gap-2 rounded-md border border-border-base bg-background-base px-3 py-2 text-text-weak">
            <Spinner />
            <span class="text-12-regular">Loading file...</span>
          </div>
        }
      >
        <FileEditor
          path={props.path}
          state={state()}
          value={draft()}
          active={true}
          frontmatterPanel={props.frontmatterPanel}
          onChange={setDraft}
          onSave={() => void save()}
          onMode={setMode}
          mention={mention}
        />
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

  const [readme] = createResource(
    async () => {
      const names = ["README.md", "readme.md", "README.markdown", "Readme.md"]
      for (const name of names) {
        try {
          const data = (await sdk.client.file.read({ path: name })).data
          if (data && data.type === "text" && data.encoding !== "base64") return name
        } catch { }
      }
      return undefined
    },
    { initialValue: undefined },
  )

  return (
    <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Show when={!readme.loading} fallback={<InlineSpinner label="Loading README..." />}>
        <Show
          when={readme.latest}
          fallback={
            <div class="m-3 rounded-md border border-border-base bg-background-base px-3 py-3 text-12-regular text-text-weak text-center">
              No README.md at project root
            </div>
          }
        >
          {(path) => <FileEntityPreview path={path()} frontmatterPanel={false} />}
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
  const facts = createMemo(() => ent.latest?.facts ?? [])
  const inline = createMemo(() => inlineBody(facts()))
  const path = createMemo(() => entityMarkdownPath(facts()))
  const otherFacts = createMemo(() =>
    (ent.latest?.facts ?? []).filter((f) => !OMIT_FACT_KEYS.has(f.a) && f.a !== "path"),
  )

  return (
    <div class="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Show when={ent.loading}>
        <div class="flex items-center gap-2 p-3 text-text-weak">
          <Spinner />
          <span class="text-12-regular">Loading...</span>
        </div>
      </Show>
      <Show when={!ent.loading}>
        <Switch>
          <Match when={path()}>
            {(mdPath) => <FileEntityPreview path={mdPath()} frontmatterPanel={false} />}
          </Match>
          <Match when={inline()}>
            {(body) => <EntityInlineMarkdownPreview id={props.id} value={body()} />}
          </Match>
          <Match when={otherFacts().length > 0}>
            <div class="overflow-y-auto p-3">
              <FactPreview facts={otherFacts()} />
            </div>
          </Match>
          <Match when={true}>
            <div class="flex flex-1 items-center justify-center p-3 text-12-regular text-text-weak">
              No preview available
            </div>
          </Match>
        </Switch>
      </Show>
    </div>
  )
}

function EntityInlineMarkdownPreview(props: { id: string; value: string }) {
  const mention = useMentionCallbacksOptional()
  const [mode, setMode] = createSignal<"rich" | "raw">("rich")
  const [draft, setDraft] = createSignal(props.value)
  const virtual = () => `@entities/${props.id.replace(":", "/")}.md`
  const state = createMemo(
    (): FileState => ({
      path: virtual(),
      name: `${props.id}.md`,
      loaded: true,
      mode: mode(),
      content: { type: "text", content: props.value },
      draft: draft() !== props.value ? draft() : undefined,
    }),
  )

  return (
    <div class="h-full min-h-0 overflow-hidden">
      <FileEditor
        path={virtual()}
        state={state()}
        value={draft()}
        active={true}
        frontmatterPanel={false}
        onChange={setDraft}
        onSave={() => undefined}
        onMode={setMode}
        mention={mention}
      />
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
