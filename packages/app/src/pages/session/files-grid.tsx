import { createEffect, createMemo, For, onCleanup, onMount, Show, Switch, Match } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode-ai/ui/icon"
import { useGlobalSDK } from "@/context/global-sdk"
import { useFile } from "@/context/file"

type MediaFile = {
  path: string
  name: string
  ext: string
  category: string
  size?: number
  description?: string
}

type State = {
  files: MediaFile[]
  loading: boolean
  query: string
  selected: string | null
  descriptions: Record<string, string>
}

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp",
  "tiff",
  "tif",
  "avif",
  "heic",
  "heif",
  "apng",
  "jxl",
])

const CATEGORY_COLORS: Record<string, string> = {
  image: "var(--color-teal-400, #2dd4bf)",
  video: "var(--color-purple-400, #c084fc)",
  audio: "var(--color-cyan-400, #22d3ee)",
  document: "var(--color-blue-400, #60a5fa)",
  archive: "var(--color-amber-400, #fbbf24)",
  font: "var(--color-pink-400, #f472b6)",
  other: "var(--color-gray-400, #9ca3af)",
}

const CATEGORY_ICONS: Record<string, string> = {
  image: "image",
  video: "film",
  audio: "music",
  document: "file-text",
  archive: "archive",
  font: "type",
  other: "file",
}

const formatSize = (bytes?: number) => {
  if (bytes === undefined) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilesGrid() {
  const sdk = useGlobalSDK()
  const fileCtx = useFile()

  const [state, setState] = createStore<State>({
    files: [],
    loading: true,
    query: "",
    selected: null,
    descriptions: {},
  })

  const load = async () => {
    setState("loading", true)
    try {
      const res = await sdk.fetch(`${sdk.url}/file/media/list`)
      if (res.ok) {
        const data = (await res.json()) as MediaFile[]
        setState("files", data)
        const descs: Record<string, string> = {}
        for (const f of data) {
          if (f.description) descs[f.path] = f.description
        }
        setState("descriptions", descs)
      }
    } catch {
      // ignore
    } finally {
      setState("loading", false)
    }
  }

  // Reload whenever a file is added/removed/renamed in the workspace (e.g. an
  // agent tool drops a new asset) so the grid stays in sync without a refresh.
  createEffect(() => {
    fileCtx.catalogRevision()
    void load()
  })

  const filtered = createMemo(() => {
    const q = state.query.toLowerCase().trim()
    if (!q) return state.files
    return state.files.filter(
      (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q) || f.category.includes(q),
    )
  })

  const selected = createMemo(() => (state.selected ? state.files.find((f) => f.path === state.selected) : undefined))

  const describe = async (path: string) => {
    if (state.descriptions[path]) return
    try {
      const res = await sdk.fetch(`${sdk.url}/file/media/describe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      })
      if (res.ok) {
        const data = (await res.json()) as { description: string }
        setState("descriptions", path, data.description)
      }
    } catch {
      // ignore
    }
  }

  const thumbUrl = (file: MediaFile) => `${sdk.url}/file/content?path=${encodeURIComponent(file.path)}`

  const close = () => setState("selected", null)

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && state.selected) close()
  }

  onMount(() => document.addEventListener("keydown", onKey))
  onCleanup(() => document.removeEventListener("keydown", onKey))

  return (
    <div class="media-grid-root">
      {/* Header */}
      <div class="media-grid-header">
        <div class="media-grid-search">
          <Icon name="search" size="small" class="text-icon-weak shrink-0" />
          <input
            type="text"
            placeholder="Filter media files…"
            value={state.query}
            onInput={(e) => setState("query", e.currentTarget.value)}
            class="media-grid-search-input"
          />
        </div>
        <button class="media-grid-refresh" onClick={load} title="Refresh">
          <Icon name="refresh-cw" size="small" />
        </button>
      </div>

      {/* Body */}
      <div class="media-grid-body">
        {/* Grid */}
        <div class="media-grid-scroll" classList={{ "media-grid-scroll--narrow": !!state.selected }}>
          <Show when={state.loading}>
            <div class="media-grid-empty">Loading…</div>
          </Show>

          <Show when={!state.loading && filtered().length === 0}>
            <div class="media-grid-empty">No media files found</div>
          </Show>

          <Show when={!state.loading && filtered().length > 0}>
            <div class="media-grid-cards">
              <For each={filtered()}>
                {(file) => (
                  <MediaCard
                    file={file}
                    active={state.selected === file.path}
                    fresh={fileCtx.isFresh(file.path)}
                    description={state.descriptions[file.path]}
                    thumbUrl={thumbUrl(file)}
                    onSelect={() => {
                      setState("selected", state.selected === file.path ? null : file.path)
                      describe(file.path)
                    }}
                    onVisible={() => describe(file.path)}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Detail Panel */}
        <Show when={selected()}>
          {(file) => (
            <div class="media-detail">
              <div class="media-detail-header">
                <span class="media-detail-title">{file().name}</span>
                <button class="media-detail-close" onClick={close}>
                  <Icon name="x" size="small" />
                </button>
              </div>

               <div class="media-detail-preview">
                 <Show
                   when={IMAGE_EXTS.has(file().ext)}
                   fallback={
                     <Switch>
                       <Match when={file().category === "video"}>
                         <video src={thumbUrl(file())} controls class="max-w-full max-h-full" />
                       </Match>
                       <Match when={true}>
                         <div
                           class="media-detail-badge"
                           style={{ background: CATEGORY_COLORS[file().category] ?? CATEGORY_COLORS.other }}
                         >
                           <Icon name={CATEGORY_ICONS[file().category] ?? "file"} size="medium" />
                           <span>.{file().ext}</span>
                         </div>
                       </Match>
                     </Switch>
                   }
                 >
                   <img src={thumbUrl(file())} alt={file().name} class="media-detail-img" />
                 </Show>
               </div>

              <div class="media-detail-meta">
                <div class="media-detail-row">
                  <span class="media-detail-label">Path</span>
                  <span class="media-detail-value" title={file().path}>
                    {file().path}
                  </span>
                </div>
                <div class="media-detail-row">
                  <span class="media-detail-label">Type</span>
                  <span class="media-detail-value">
                    {file().category} / .{file().ext}
                  </span>
                </div>
                <Show when={file().size !== undefined}>
                  <div class="media-detail-row">
                    <span class="media-detail-label">Size</span>
                    <span class="media-detail-value">{formatSize(file().size)}</span>
                  </div>
                </Show>
              </div>

              <Show when={state.descriptions[file().path]}>
                {(desc) => (
                  <div class="media-detail-desc">
                    <span class="media-detail-label">AI Description</span>
                    <p class="media-detail-desc-text">{desc()}</p>
                  </div>
                )}
              </Show>

              <Show when={!state.descriptions[file().path]}>
                <div class="media-detail-desc">
                  <button class="media-detail-describe-btn" onClick={() => describe(file().path)}>
                    Generate description
                  </button>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}

function MediaCard(props: {
  file: MediaFile
  active: boolean
  fresh?: boolean
  description?: string
  thumbUrl: string
  onSelect: () => void
  onVisible: () => void
}) {
  let ref: HTMLButtonElement | undefined
  let observed = false

  onMount(() => {
    if (!ref) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !observed) {
          observed = true
          props.onVisible()
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(ref)
    onCleanup(() => observer.disconnect())
  })

  return (
    <button
      ref={ref}
      class="media-card"
      classList={{ "media-card--active": props.active, "fresh-overlay": !!props.fresh }}
      onClick={props.onSelect}
      title={props.file.path}
    >
      <div class="media-card-thumb">
        <Show
          when={IMAGE_EXTS.has(props.file.ext)}
          fallback={
            <div
              class="media-card-badge"
              style={{ background: CATEGORY_COLORS[props.file.category] ?? CATEGORY_COLORS.other }}
            >
              <Icon name={CATEGORY_ICONS[props.file.category] ?? "file"} size="small" />
            </div>
          }
        >
          <img src={props.thumbUrl} alt={props.file.name} class="media-card-img" loading="lazy" />
        </Show>
      </div>
      <div class="media-card-info">
        <div class="media-card-name">{props.file.name}</div>
        <Show when={props.description}>{(desc) => <div class="media-card-desc">{desc()}</div>}</Show>
        <Show when={!props.description && props.file.size !== undefined}>
          <div class="media-card-size">{formatSize(props.file.size)}</div>
        </Show>
      </div>
    </button>
  )
}
