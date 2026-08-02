import { Show } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { useTrellisOptional } from "@/context/trellis"
import { decode64 } from "@/utils/base64"
import { healthColor } from "../colors"

export function TrellisPopover() {
  const trellis = useTrellisOptional()
  const params = useParams()
  const navigate = useNavigate()
  const dir = () => decode64(params.dir ?? "") ?? ""
  const s = () => trellis?.stats

  const goToTrellis = () => {
    navigate(`/${base64Encode(dir())}/trellis`)
  }

  return (
    <div
      class="rounded-xl shadow-[var(--shadow-lg-border-base)] p-3 text-[12px]"
      style={{ background: "var(--background-strong)" }}
    >
      <div class="font-semibold opacity-60 text-[10px] uppercase tracking-wide mb-2">Trellis</div>
      <Show when={s()}>
        {(stats) => (
          <div class="space-y-2">
            <div class="grid grid-cols-2 gap-x-4 gap-y-1">
              <div class="flex items-center justify-between">
                <span class="opacity-50">Ops</span>
                <span class="tabular-nums">{stats().totalOps}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="opacity-50">Files</span>
                <span class="tabular-nums">{stats().trackedFiles}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="opacity-50">Nodes</span>
                <span class="tabular-nums">{stats().nodeCount}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="opacity-50">Edges</span>
                <span class="tabular-nums">{stats().edgeCount}</span>
              </div>
              <Show when={stats().hiddenNodes > 0}>
                <div class="flex items-center justify-between">
                  <span class="opacity-50">Hidden</span>
                  <span class="tabular-nums">{stats().hiddenNodes}</span>
                </div>
              </Show>
              <Show when={stats().issueCount > 0}>
                <div class="flex items-center justify-between">
                  <span class="opacity-50">Issues</span>
                  <span class="tabular-nums">
                    {stats().activeIssues}/{stats().issueCount}
                  </span>
                </div>
              </Show>
              <Show when={!isNaN(stats().avgIssueHealth)}>
                <div class="flex items-center justify-between">
                  <span class="opacity-50">Health</span>
                  <span class="tabular-nums" style={{ color: healthColor(stats().avgIssueHealth) }}>
                    {Math.round(stats().avgIssueHealth * 100)}%
                  </span>
                </div>
              </Show>
            </div>
            <div class="pt-2 border-t border-white/10">
              <button class="text-[11px] opacity-60 hover:opacity-100 transition-opacity" onClick={goToTrellis}>
                Open Trellis board →
              </button>
            </div>
          </div>
        )}
      </Show>
      <Show when={!s()}>
        <div class="opacity-40 text-center py-2">No Trellis data</div>
      </Show>
    </div>
  )
}
