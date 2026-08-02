import { createMemo, For, Show } from "solid-js"
import type { Message, Part } from "@opencode-ai/sdk/v2"
import { Button } from "@opencode-ai/ui/button"
import { ArrowUpRight, FileDiff, PenLine, Calendar, StickyNote, Database, Globe, Palette, AlertTriangle } from "lucide-solid"
import { extractTurnDestinations, type AgentTurnDestination } from "@/lib/agent-turn-destinations"
import { applyAgentTurnDestination } from "@/lib/apply-agent-destination"
import type { EntityNav } from "@/lib/entity-navigate"

function iconFor(dest: AgentTurnDestination) {
  switch (dest.kind) {
    case "notice":
      return AlertTriangle
    case "whiteboard":
      return PenLine
    case "projection":
      if (dest.lens === "calendar") return Calendar
      if (dest.lens === "notes") return StickyNote
      return ArrowUpRight
    case "cms-entry":
    case "cms-collection":
      return Database
    case "browser":
      return Globe
    case "design":
      return Palette
    case "review":
      return FileDiff
    default:
      return ArrowUpRight
  }
}

export function AgentTurnActions(props: {
  userMessageId: string
  messages: Message[]
  partsByMessage: Record<string, Part[] | undefined>
  hasFileDiffs?: boolean
  working?: boolean
  nav: EntityNav
}) {
  const destinations = createMemo(() => {
    if (props.working) return []
    return extractTurnDestinations({
      userMessageId: props.userMessageId,
      messages: props.messages,
      partsByMessage: props.partsByMessage,
      hasFileDiffs: props.hasFileDiffs,
    })
  })

  return (
    <Show when={destinations().length > 0}>
      <div class="agent-turn-actions px-4 md:px-5 pb-3 pt-8">
        <div class="flex flex-wrap gap-2">
          <For each={destinations()}>
            {(dest) => {
              const Icon = iconFor(dest)
              if (dest.kind === "notice") {
                return (
                  <span
                    class="agent-turn-actions__notice inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 text-11-regular text-warning"
                    title={dest.description}
                  >
                    <Icon class="size-3.5 shrink-0 opacity-90" />
                    <span class="truncate">{dest.label}</span>
                  </span>
                )
              }
              return (
                <Button
                  size="small"
                  variant="secondary"
                  class="agent-turn-actions__btn h-7 text-11-regular"
                  onClick={() => void applyAgentTurnDestination(dest, props.nav)}
                >
                  <Icon class="size-3.5 shrink-0 opacity-80" />
                  <span>{dest.label}</span>
                </Button>
              )
            }}
          </For>
        </div>
      </div>
    </Show>
  )
}
