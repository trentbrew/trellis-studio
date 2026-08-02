import { createMemo, createSignal, Show, For } from "solid-js"
import { useTrellisOptional } from "@/context/trellis"

const reducedMotion =
  typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : true

interface StatItemProps {
  label: string
  value: string | number
  prevValue?: string | number
  color?: string
}

function StatItem(props: StatItemProps) {
  const changed = createMemo(() => props.prevValue !== undefined && props.prevValue !== props.value)

  return (
    <div class="flex items-center gap-1">
      <span
        class="text-[12px] font-medium tabular-nums transition-all duration-300"
        classList={{
          "animate-in-slide-up-fast": !reducedMotion && changed(),
        }}
        style={{ color: props.color || "inherit" }}
      >
        {props.value}
      </span>
      <span class="text-[9px] uppercase tracking-wider opacity-40 font-semibold">{props.label}</span>
    </div>
  )
}

export function StatsSegment() {
  const trellis = useTrellisOptional()
  const [prevStats, setPrevStats] = createSignal({ ops: 0, nodes: 0, edges: 0 })
  const [shown, setShown] = createSignal(false)

  const stats = createMemo(() => {
    const s = trellis?.stats
    if (!s) return null
    return {
      ops: s.totalOps,
      nodes: s.nodeCount,
      edges: s.edgeCount,
      files: s.trackedFiles,
      hidden: s.hiddenNodes,
    }
  })

  const hasStats = createMemo(() => stats() !== null)

  return (
    <Show when={hasStats()}>
      <div
        class="flex items-center gap-4 px-2 py-1 rounded-md cursor-pointer hover:bg-white/5 transition-all duration-200"
        onClick={() => setShown(!shown())}
      >
        <StatItem label="ops" value={stats()?.ops ?? 0} />
        <StatItem label="nodes" value={stats()?.nodes ?? 0} />
        <StatItem label="edges" value={stats()?.edges ?? 0} />
      </div>

      <Show when={shown()}>
        <div
          class="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-xl shadow-[var(--shadow-lg-border-base)] p-4 text-[12px] animate-in-slide-up min-w-[200px]"
          style={{ background: "var(--background-strong)" }}
        >
          <div class="text-[11px] font-semibold mb-3 opacity-80">Workspace Stats</div>
          <div class="space-y-2">
            <div class="flex justify-between text-[11px]">
              <span class="opacity-60">Operations</span>
              <span class="tabular-nums font-medium">{stats()?.ops}</span>
            </div>
            <div class="flex justify-between text-[11px]">
              <span class="opacity-60">Graph Nodes</span>
              <span class="tabular-nums font-medium">{stats()?.nodes}</span>
            </div>
            <div class="flex justify-between text-[11px]">
              <span class="opacity-60">Graph Edges</span>
              <span class="tabular-nums font-medium">{stats()?.edges}</span>
            </div>
            <div class="flex justify-between text-[11px]">
              <span class="opacity-60">Tracked Files</span>
              <span class="tabular-nums font-medium">{stats()?.files}</span>
            </div>
            <Show when={(stats()?.hidden ?? 0) > 0}>
              <div class="flex justify-between text-[11px]">
                <span class="opacity-60">Hidden Nodes</span>
                <span class="tabular-nums font-medium">{stats()?.hidden}</span>
              </div>
            </Show>
          </div>
          <div class="mt-3 pt-3 border-t border-white/10 text-[10px] opacity-50">
            Updates in realtime as the graph changes
          </div>
        </div>
      </Show>
    </Show>
  )
}
