import { For, Match, Show, Switch, createMemo, onMount, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import { getFilename } from "@opencode-ai/util/path"
import { useEntityDialog } from "@/components/entity-dialog"
import { useFile } from "@/context/file"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { type TrellisOp, type WorkUnit, useTrellisOptional } from "@/context/trellis"
import { EntityIcon } from "@/lib/entity-theme"
import { searchMentions } from "@/lib/mention-search"
import { mentionTrellisCtx } from "@/lib/mention-trellis"
import { useTrellisStoreOptional } from "@/context/trellis-store"
import { FileEditor } from "@/pages/session/file-editor"
import { media } from "@/pages/session/media"
import { useSessionLayout } from "@/pages/session/session-layout"
import { TrellisOpBadge } from "../trellis-op-icon"
import { showToast } from "@opencode-ai/ui/toast"

const cols = [
  { id: "backlog", label: "Backlog", tone: "var(--text-weak)" },
  { id: "in_progress", label: "In Progress", tone: "var(--text-weak)" },
  { id: "paused", label: "Paused", tone: "var(--text-weak)" },
  { id: "closed", label: "Closed", tone: "var(--text-weak)" },
] as const

const unitCol: Record<WorkUnit["status"], string> = {
  backlog: "backlog",
  in_progress: "in_progress",
  done: "closed",
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// ---------------------------------------------------------------------------
// HomeDashboard — bird's-eye project overview with data viz
// ---------------------------------------------------------------------------

export function HomeDashboard() {
  const file = useFile()
  const language = useLanguage()
  const sdk = useSDK()
  const sync = useSync()
  const trellis = useTrellisOptional()
  const trellisStore = useTrellisStoreOptional()
  const { tabs } = useSessionLayout()
  const [state, setState] = createStore({
    ready: false,
    path: undefined as string | undefined,
    creating: false,
  })

  const title = createMemo(() => sync.project?.name || getFilename(sdk.directory) || "Project")
  const ops = createMemo(() => (trellis ? [...trellis.ops].reverse() : []))
  const load = (p: string) => {
    setState("path", p)
    setState("ready", true)
    return file.load(p).then(() => {
      file.setMode(p, "rich")
    })
  }
  const create = () => {
    if (state.creating) return
    setState("creating", true)
    void sdk.client.file
      .write({
        fileWriteInput: {
          path: "README.md",
          content: `# ${title()}

Welcome to ${title()}.

## Getting started

Start by describing what this project is for and what you're building.
`,
          format: true,
        },
      })
      .then(() => file.tree.refresh(""))
      .then(() => load("README.md"))
      .finally(() => setState("creating", false))
  }

  onMount(() => {
    void trellis?.fetchOps(400)
    void trellis?.fetchStoreEntities()
    void file.tree
      .list("")
      .then(() => {
        const item = file.tree.children("").find((child) => {
          if (child.type !== "file") return false
          const name = child.path.split("/").pop() ?? child.path
          return /^readme(?:\.(md|markdown|mdx|note))?$/i.test(name)
        })
        if (!item) {
          setState("ready", true)
          return
        }
        return load(item.path)
      })
      .catch(() => setState("ready", true))
  })

  const path = createMemo(() => state.path)
  const view = createMemo(() => {
    const p = path()
    if (!p) return
    return file.get(p)
  })
  const text = createMemo(() => {
    const p = path()
    if (!p) return ""
    return file.text(p) ?? ""
  })
  const editable = createMemo(() => {
    const content = view()?.content
    return content?.type === "text" && content.encoding !== "base64"
  })
  const readmeHeight = createMemo(() => {
    if (!path()) return undefined
    const lines = text()
      .split(/\r\n|\r|\n/)
      .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 92)), 0)
    return Math.max(120, lines * 24 + 96)
  })
  const readmeStyle = createMemo<JSX.CSSProperties>(() => {
    const height = readmeHeight()
    if (!height) return { "aspect-ratio": "1 / 1" }
    return { height: `${height}px` }
  })
  const activityStyle = createMemo<JSX.CSSProperties>(() => {
    const height = readmeHeight()
    if (!height) return { "aspect-ratio": "1 / 1" }
    return { "max-height": `${height}px` }
  })

  const save = () => {
    const p = path()
    if (!p) return
    void file.save(p)
  }

  return (
    <div class="h-full overflow-y-auto bg-background-base p-4">
      <div class="mx-auto grid max-w-[1400px] grid-cols-12 gap-4">
        <HomeCard
          title="README.md"
          icon={<Icon name="file-text" size="small" class="text-icon-weak" />}
          class={`col-span-8 self-start`}
        >
          <div
            class="min-h-0 flex-1 overflow-hidden rounded-xl border border-border-weaker-base bg-background-base"
            style={readmeStyle()}
          >
            <Switch>
              <Match when={!state.ready}>
                <div class="flex h-full items-center justify-center gap-2 text-12-regular text-text-weak">
                  <Spinner />
                  <span>
                    {language.t("common.loading")}
                    {language.t("common.loading.ellipsis")}
                  </span>
                </div>
              </Match>
              <Match when={path() && view()?.loaded && editable()}>
                <FileEditor
                  path={path()!}
                  state={view()!}
                  value={text()}
                  active={true}
                  onChange={(value) => file.setDraft(path()!, value)}
                  onSave={save}
                  onMode={(value) => file.setMode(path()!, value)}
                  mention={{
                    search: (query) =>
                      searchMentions({
                        query,
                        file,
                        sync,
                        trellis: mentionTrellisCtx(trellis, trellisStore?.facts),
                      }),
                    fetch: async (id, type) => {
                      if (type !== "file") return undefined
                      await file.load(id)
                      return file.text(id)
                    },
                    navigate: (attrs) => {
                      if (attrs.type !== "file") return
                      const tab = file.tab(attrs.id)
                      if (!tabs().all().includes(tab)) tabs().open(tab)
                      tabs().setActive(tab)
                      void file.load(attrs.id)
                    },
                    onCreate: async (rel) => {
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
                    },
                  }}
                />
              </Match>
              <Match when={path() && view()?.loading}>
                <div class="flex h-full items-center justify-center text-12-regular text-text-weak">
                  {language.t("common.loading")}
                  {language.t("common.loading.ellipsis")}
                </div>
              </Match>
              <Match when={view()?.error}>{(err) => <div class="px-6 py-4 text-text-weak">{err()}</div>}</Match>
              <Match when={state.ready}>
                <div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                  <div class="text-13-medium text-text-strong">No README found in the project root.</div>
                  <div class="max-w-sm text-12-regular text-text-weaker">
                    Create one explicitly to add rich project context to Home.
                  </div>
                  <Button size="small" variant="secondary" onClick={create} disabled={state.creating}>
                    {state.creating ? "Creating..." : "Create README"}
                  </Button>
                </div>
              </Match>
            </Switch>
          </div>
        </HomeCard>

        <HomeCard
          title="Recent Activity"
          icon={<Icon name="history" size="small" class="text-icon-weak" />}
          class="col-span-4 min-h-0 self-start overflow-hidden"
          style={activityStyle()}
        >
          <div class="min-h-0 flex-1 overflow-y-auto">
            <div class="grid gap-1">
              <For
                each={ops()}
                fallback={<div class="text-12-regular text-text-weaker">No recent Trellis operations yet.</div>}
              >
                {(op) => (
                  <div
                    class="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 hover:bg-surface-raised-base/40"
                    classList={{
                      "border-text-accent/30 bg-surface-raised-base/70": op.kind === "vcs:decisionRecord",
                    }}
                    style={op.kind === "vcs:decisionRecord" ? decisionStyle() : undefined}
                  >
                    <TrellisOpBadge kind={op.kind} />
                    <div class="min-w-0 flex-1 truncate text-12-regular text-text-base">{opText(op)}</div>
                    <div class="shrink-0 text-11-mono text-text-weaker">{op.hash.slice(0, 7)}</div>
                    <div class="shrink-0 text-11-regular text-text-weaker">{timeAgo(op.timestamp)}</div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </HomeCard>
      </div>
    </div>
  )
}

function HomeCard(props: {
  title: string
  icon: JSX.Element
  class?: string
  style?: JSX.CSSProperties
  children: JSX.Element
}) {
  return (
    <section
      class={`flex flex-col rounded-2xl border border-border-weaker-base bg-surface-raised-base/45 p-4 ${props.class ?? ""}`}
      style={props.style}
    >
      <div class="mb-3 flex items-center gap-2">
        {props.icon}
        <h2 class="text-13-semibold text-text-strong">{props.title}</h2>
      </div>
      {props.children}
    </section>
  )
}

function decisionStyle(): JSX.CSSProperties {
  return {
    "border-left": "3px solid var(--text-accent)",
    "background-image":
      "linear-gradient(90deg, color-mix(in srgb, var(--text-accent) 12%, transparent), transparent 55%)",
  }
}

function opText(op: TrellisOp) {
  if (op.milestoneMessage) return op.milestoneMessage
  if (op.filePath) return `${op.kind} — ${op.filePath.split("/").pop()}`
  if (op.branchName) return `${op.kind} — ${op.branchName}`
  return op.kind
}
