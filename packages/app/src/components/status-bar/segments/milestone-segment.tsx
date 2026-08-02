import { createMemo, Show } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useTrellisOptional } from "@/context/trellis"

export function MilestoneSegment() {
  const trellis = useTrellisOptional()

  const current = createMemo(() => trellis?.milestones?.find((m) => m.status === "active"))

  return (
    <Show when={current()}>
      {(m) => (
        <div class="flex items-center gap-1 px-1.5 py-0.5 shrink-0 min-w-0" title={m().title}>
          <Icon name="mountain" size="small" class="shrink-0 text-text-weak" style={{ "font-size": "12px" }} />
          <span class="text-[11px] opacity-70 truncate max-w-[140px]">{m().title}</span>
        </div>
      )}
    </Show>
  )
}
