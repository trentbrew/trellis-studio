import { Show } from "solid-js"
import { useTrellisOptional } from "@/context/trellis"

export function IssueCountSegment() {
  const trellis = useTrellisOptional()

  const active = () => trellis?.stats?.activeIssues ?? 0
  const total = () => trellis?.stats?.issueCount ?? 0

  return (
    <Show when={total() > 0}>
      <div
        class="flex items-center gap-1 px-1.5 py-0.5 shrink-0"
        title={`${active()} active / ${total()} total issues`}
      >
        <span class="text-[11px] tabular-nums font-medium opacity-70">
          {active()}/{total()}
        </span>
        <span class="text-[10px] opacity-40">issues</span>
      </div>
    </Show>
  )
}
