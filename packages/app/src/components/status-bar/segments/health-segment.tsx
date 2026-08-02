import { Popover } from "@opencode-ai/ui/popover"
import { createMemo, createSignal, Show } from "solid-js"
import { useTrellisOptional } from "@/context/trellis"
import { healthColor } from "../colors"

const reducedMotion = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : true

export function HealthSegment() {
  const trellis = useTrellisOptional()
  const [shown, setShown] = createSignal(false)

  const health = createMemo(() => {
    const h = trellis?.stats?.avgIssueHealth
    if (h === undefined) return null
    return h
  })

  const healthLabel = createMemo(() => {
    const h = health()
    if (h === null) return "—"
    if (h >= 0.8) return "Healthy"
    if (h >= 0.5) return "Needs attention"
    return "Critical"
  })

  const pulseClass = createMemo(() => {
    if (reducedMotion) return ""
    const h = health()
    if (h === null) return ""
    if (h >= 0.8) return ""
    if (h >= 0.5) return "animate-pulse"
    return "animate-pulse"
  })

  return (
    <Show when={health() !== null}>
      <Popover
        open={shown()}
        onOpenChange={setShown}
        placement="bottom-start"
        gutter={4}
        class="[&_[data-slot=popover-body]]:p-0 w-[260px] bg-transparent border-0 shadow-none rounded-xl"
        trigger={
          <div
            class="flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer hover:bg-white/5 transition-all duration-200"
            classList={{ [pulseClass()]: true }}
          >
            <div
              class="w-2 h-2 rounded-full transition-all duration-300"
              classList={{
                "animate-ping": !reducedMotion && health() !== null && health()! < 0.5,
              }}
              style={{ background: healthColor(health() ?? 0) }}
            />
            <span class="text-[11px] font-medium" style={{ color: healthColor(health() ?? 0) }}>
              {healthLabel()}
            </span>
            <span class="tabular-nums text-[11px] opacity-70">
              {Math.round((health() ?? 0) * 100)}%
            </span>
          </div>
        }
      >
        <Show when={shown()}>
          <div
            class="rounded-xl shadow-[var(--shadow-lg-border-base)] p-4 text-[12px] animate-in-fade"
            style={{ background: "var(--background-strong)" }}
          >
            <div class="flex items-center gap-2 mb-3">
              <div
                class="w-3 h-3 rounded-full"
                style={{ background: healthColor(health() ?? 0) }}
              />
              <span class="font-semibold" style={{ color: healthColor(health() ?? 0) }}>
                Graph Health: {Math.round((health() ?? 0) * 100)}%
              </span>
            </div>
            <p class="opacity-70 text-[11px] leading-relaxed mb-3">
              Based on issue health, decision quality, and session efficiency metrics from the workspace graph.
            </p>
            <div class="space-y-2 text-[11px]">
              <div class="flex justify-between">
                <span class="opacity-60">Issue Health</span>
                <span class="tabular-nums">{Math.round((trellis?.stats?.avgIssueHealth ?? 0) * 100)}%</span>
              </div>
              <div class="flex justify-between">
                <span class="opacity-60">Active Issues</span>
                <span class="tabular-nums">{trellis?.stats?.activeIssues ?? 0}</span>
              </div>
              <div class="flex justify-between">
                <span class="opacity-60">Total Issues</span>
                <span class="tabular-nums">{trellis?.stats?.issueCount ?? 0}</span>
              </div>
            </div>
          </div>
        </Show>
      </Popover>
    </Show>
  )
}
