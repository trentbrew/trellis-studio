import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"

type Props = {
  dir: string
  name: string
  branch: string | undefined
}

export function ContextPopover(props: Props) {
  return (
    <div
      class="rounded-xl shadow-[var(--shadow-lg-border-base)] p-3 text-[12px] space-y-2"
      style={{ background: "var(--background-strong)" }}
    >
      <div class="font-semibold opacity-60 text-[10px] uppercase tracking-wide">Project</div>
      <Show when={props.name}>
        <div class="flex items-center gap-1.5">
          <Icon name="folder-add-left" size="small" class="opacity-50 shrink-0" style={{ "font-size": "12px" }} />
          <span class="opacity-80">{props.name}</span>
        </div>
      </Show>
      <Show when={props.branch}>
        <div class="flex items-center gap-1.5">
          <Icon name="branch" size="small" class="opacity-50 shrink-0" style={{ "font-size": "12px" }} />
          <span class="opacity-80">{props.branch}</span>
        </div>
      </Show>
      <Show when={props.dir}>
        <div class="opacity-40 text-[11px] truncate pt-1 border-t border-white/10">{props.dir}</div>
      </Show>
    </div>
  )
}
