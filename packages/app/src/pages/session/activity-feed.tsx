import { For, Show, createMemo } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { useSync } from "@/context/sync"
import { useSessionLayout } from "@/pages/session/session-layout"
import { TrellisOpsFeed } from "@/pages/session/trellis-ops-feed"
import type { Part } from "@opencode-ai/sdk/v2/client"

type ToolEntry = {
  id: string
  tool: string
  status: string
  title: string
  subtitle: string
  time?: number
}

const TOOL_ICONS: Record<string, string> = {
  read: "glasses",
  grep: "magnifying-glass-menu",
  glob: "magnifying-glass-menu",
  list: "bullet-list",
  bash: "console",
  edit: "code-lines",
  write: "code-lines",
  apply_patch: "code-lines",
  task: "task",
  webfetch: "globe",
  websearch: "globe",
  codesearch: "magnifying-glass-menu",
  question: "bubble-5",
  skill: "brain",
  todowrite: "checklist",
}

function icon(tool: string) {
  return TOOL_ICONS[tool] ?? "dot"
}

function status(s: string) {
  if (s === "completed") return { label: "Done", color: "text-emerald-500" }
  if (s === "running" || s === "pending") return { label: "Running", color: "text-amber-500" }
  if (s === "error") return { label: "Error", color: "text-red-500" }
  return { label: s, color: "text-text-weaker" }
}

function extract(part: Part): ToolEntry | undefined {
  if (part.type !== "tool") return
  const input = (part.state as any)?.input ?? {}
  const name = part.tool
  const st = (part.state as any)?.status ?? "pending"
  const subtitle =
    input.filePath?.split("/").pop() ??
    input.path?.split("/").pop() ??
    input.command?.slice(0, 60) ??
    input.description?.slice(0, 60) ??
    input.pattern ??
    ""
  const time = (part.state as any)?.time?.start
  return { id: part.id, tool: name, status: st, title: name, subtitle, time }
}

export function ActivityFeed() {
  const sync = useSync()
  const { params } = useSessionLayout()

  const entries = createMemo(() => {
    const id = params.id
    if (!id) return []
    const msgs = sync.data.message[id] ?? []
    const out: ToolEntry[] = []
    for (const msg of msgs) {
      const parts = sync.data.part[msg.id]
      if (!parts) continue
      for (const p of parts) {
        const entry = extract(p)
        if (entry) out.push(entry)
      }
    }
    return out.reverse()
  })

  return (
    <div class="h-full flex flex-col overflow-hidden">
      <div class="shrink-0 flex items-center h-12 px-4 border-b border-border-weaker-base">
        <span class="text-13-medium text-text-strong">Activity</span>
      </div>
      <div class="flex-1 overflow-y-auto py-2">
        <Show when={entries().length === 0}>
          <div class="px-4 py-8 text-center text-12-regular text-text-weaker">No tool activity yet</div>
        </Show>
        <For each={entries()}>
          {(entry) => {
            const st = () => status(entry.status)
            return (
              <div class="flex items-start gap-2.5 px-4 py-2 hover:bg-surface-raised-base/30 transition-colors">
                <div class="mt-0.5 shrink-0 text-icon-weak">
                  <Icon name={icon(entry.tool) as any} size="small" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5">
                    <span class="text-12-medium text-text-base capitalize">{entry.title}</span>
                    <span class={`text-10-medium ${st().color}`}>{st().label}</span>
                  </div>
                  <Show when={entry.subtitle}>
                    <div class="text-11-regular text-text-weaker truncate">{entry.subtitle}</div>
                  </Show>
                </div>
              </div>
            )
          }}
        </For>
        <div class="mt-2 border-t border-border-weaker-base">
          <TrellisOpsFeed />
        </div>
      </div>
    </div>
  )
}
