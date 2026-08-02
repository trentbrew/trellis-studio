import { Popover } from "@opencode-ai/ui/popover"
import { createMemo, createSignal, lazy, Show, Suspense } from "solid-js"
import { GitBranch } from "lucide-solid"
import { useParams } from "@solidjs/router"
import { decode64 } from "@/utils/base64"
import { useGlobalSync } from "@/context/global-sync"
import { useTrellisOptional } from "@/context/trellis"

const sepR = "w-px h-4 bg-border-base/50 shrink-0"

export function TrellisSeparator() {
  const trellis = useTrellisOptional()
  const params = useParams()
  const globalSync = useGlobalSync()

  const dir = createMemo(() => decode64(params.dir ?? "") ?? "")
  const sync = createMemo(() => (dir() ? globalSync.child(dir(), { bootstrap: false })[0] : undefined))
  const git = createMemo(() => sync()?.vcs?.branch)
  const s = () => trellis?.stats

  const hasContent = createMemo(() => {
    const stats = s()
    if (!stats) return false
    return !!(stats.branch && stats.branch !== git())
  })

  return (
    <Show when={hasContent()}>
      <div class={sepR} />
      <TrellisSegment />
    </Show>
  )
}

const TrellisPopover = lazy(() => import("../popovers/trellis-popover").then((x) => ({ default: x.TrellisPopover })))

export function TrellisSegment() {
  const trellis = useTrellisOptional()
  const params = useParams()
  const globalSync = useGlobalSync()
  const [shown, setShown] = createSignal(false)

  const dir = createMemo(() => decode64(params.dir ?? "") ?? "")
  const sync = createMemo(() => (dir() ? globalSync.child(dir(), { bootstrap: false })[0] : undefined))
  const git = createMemo(() => sync()?.vcs?.branch)
  const s = () => trellis?.stats

  return (
    <Show when={s()}>
      {(stats) => (
        <Popover
          open={shown()}
          onOpenChange={setShown}
          placement="bottom-start"
          gutter={4}
          class="[&_[data-slot=popover-body]]:p-0 w-[300px] bg-transparent border-0 shadow-none rounded-xl"
          trigger={
            <Show when={stats().branch && stats().branch !== git()}>
              <div
                class="flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-md hover:bg-white/5 transition-all duration-200 shrink-0"
                title={`Trellis branch: ${stats().branch}`}
              >
                <GitBranch class="size-3 shrink-0 text-text-weak" />
                <span class="text-[10px] opacity-50 shrink-0">trellis:</span>
                <span class="truncate font-mono text-[11px] opacity-70 max-w-[100px]">{stats().branch}</span>
              </div>
            </Show>
          }
        >
          <Show when={shown()}>
            <Suspense fallback={<div class="w-[300px] h-24 rounded-xl bg-background-strong" />}>
              <TrellisPopover />
            </Suspense>
          </Show>
        </Popover>
      )}
    </Show>
  )
}
