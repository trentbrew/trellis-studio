import { createMemo, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useTrellisOptional } from "@/context/trellis"

export function CycleSegment() {
  const trellis = useTrellisOptional()

  const current = createMemo(() => trellis?.cycles?.find((c) => c.status === "in_progress"))

  return (
    <Show when={current()}>
      {(c) => (
        <div class="flex items-center gap-1 px-1.5 py-0.5 shrink-0 min-w-0" title={c().title}>
          <Icon name="refresh-cw" size="small" class="shrink-0 text-text-weak" style={{ "font-size": "12px" }} />
          <span class="text-[11px] opacity-70 truncate max-w-[140px]">{c().title}</span>
        </div>
      )}
    </Show>
  )
}
