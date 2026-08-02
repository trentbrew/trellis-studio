import { Popover } from "@opencode-ai/ui/popover"
import { Icon } from "@opencode-ai/ui/icon"
import { createMemo, createSignal, lazy, Show, Suspense } from "solid-js"
import { useParams } from "@solidjs/router"
import { getFilename } from "@opencode-ai/util/path"
import { decode64 } from "@/utils/base64"
import { useGlobalSync } from "@/context/global-sync"
import { useLayout } from "@/context/layout"

export function ContextSeparator() {
  return <ContextSegment />
}

const ContextPopover = lazy(() => import("../popovers/context-popover").then((x) => ({ default: x.ContextPopover })))

function tail(dir: string) {
  const parts = dir.split("/").filter(Boolean)
  if (parts.length <= 3) return dir
  return `…/${parts.slice(-3).join("/")}`
}

export function ContextSegment() {
  const params = useParams()
  const layout = useLayout()
  const globalSync = useGlobalSync()
  const [shown, setShown] = createSignal(false)

  const dir = createMemo(() => decode64(params.dir ?? "") ?? "")
  const project = createMemo(() => layout.projects.list().find((p) => p.worktree === dir()))
  const name = createMemo(() => {
    const p = project()
    if (p) return p.name || getFilename(p.worktree)
    const d = dir()
    return d ? getFilename(d) : ""
  })
  const sync = createMemo(() => (dir() ? globalSync.child(dir(), { bootstrap: false })[0] : undefined))
  const branch = createMemo(() => sync()?.vcs?.branch)
  const label = createMemo(() => dir())

  return (
    <Show when={dir()}>
      <Popover
        open={shown()}
        onOpenChange={setShown}
        placement="bottom-start"
        gutter={4}
        class="[&_[data-slot=popover-body]]:p-0 w-[300px] bg-transparent border-0 shadow-none rounded-xl"
        trigger={
          <div
            class="flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-md hover:bg-white/5 transition-all duration-200 shrink min-w-0"
            title={dir()}
          >
            <Icon name="folder-add-left" size="small" class="shrink-0 text-text-weak" style={{ "font-size": "12px" }} />
            <span class="truncate opacity-70 font-mono text-[11px] max-w-[500px]">{label()}</span>
            <Show when={branch()}>
              <span class="text-[10px] opacity-30 shrink-0">/</span>
              <Icon name="branch" size="small" class="shrink-0 text-text-weak" style={{ "font-size": "12px" }} />
              <span class="truncate opacity-70 font-mono text-[11px] max-w-[500px]">{branch()}</span>
            </Show>
          </div>
        }
      >
        <Show when={shown()}>
          <Suspense fallback={<div class="w-[300px] h-16 rounded-xl bg-background-strong" />}>
            <ContextPopover dir={dir()} name={name()} branch={branch()} />
          </Suspense>
        </Show>
      </Popover>
    </Show>
  )
}
