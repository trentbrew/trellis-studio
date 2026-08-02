import { For, Show, createEffect, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode-ai/ui/icon"
import { useTrellisOptional, type TrellisOp } from "@/context/trellis"

const OP_ICONS: Record<string, string> = {
  "file:create": "plus-small",
  "file:update": "code-lines",
  "file:delete": "close-small",
  "branch:create": "merge",
  "branch:switch": "merge",
  milestone: "flag",
  snapshot: "camera",
  init: "rocket",
  "file.media.generate": "palette",
}

function opIcon(op: TrellisOp) {
  return OP_ICONS[op.toolName ?? op.kind] ?? "dot"
}

function opLabel(op: TrellisOp) {
  if (op.milestoneMessage) return op.milestoneMessage
  if (op.toolName === "file.media.generate") {
    const output = op.outputSummary?.split("/").pop()
    return output ? `imagegen - ${output}` : "imagegen"
  }
  if (op.toolName) return op.toolName
  if (op.filePath) return `${op.kind} \u2014 ${op.filePath.split("/").pop()}`
  if (op.branchName) return `${op.kind} \u2014 ${op.branchName}`
  return op.kind
}

function timeAgo(ts: string) {
  const ms = Date.now() - new Date(ts).getTime()
  if (ms < 60_000) return "just now"
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return `${Math.floor(ms / 86_400_000)}d ago`
}

export function TrellisOpsFeed() {
  const trellis = useTrellisOptional()
  const [state, set] = createStore({ loaded: false })

  createEffect(() => {
    if (!trellis) return
    void trellis.fetchOps(20).then(() => set("loaded", true))
    const timer = setInterval(() => void trellis.fetchOps(20), 10_000)
    onCleanup(() => clearInterval(timer))
  })

  const ops = createMemo(() => {
    if (!trellis) return []
    return [...trellis.ops].reverse().slice(0, 20)
  })

  return (
    <Show when={trellis && state.loaded} fallback={null}>
      <div class="flex flex-col gap-1">
        <div class="px-3 pt-3 pb-1 text-11-medium text-text-weaker uppercase tracking-wider">Trellis Ops</div>
        <Show when={ops().length === 0}>
          <div class="px-3 py-2 text-12-regular text-text-weaker">No operations yet</div>
        </Show>
        <For each={ops()}>
          {(op) => (
            <div class="flex items-start gap-2 px-3 py-1.5 hover:bg-surface-raised-base/30 transition-colors rounded-md mx-1">
              <div class="mt-0.5 shrink-0 text-icon-weaker">
                <Icon name={opIcon(op) as any} size="small" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-12-regular text-text-base truncate">{opLabel(op)}</div>
                <div class="text-11-regular text-text-weaker">{timeAgo(op.timestamp)}</div>
              </div>
              <div class="shrink-0 mt-0.5">
                <span class="text-10-regular text-text-weaker font-mono">{op.hash.slice(0, 7)}</span>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}
