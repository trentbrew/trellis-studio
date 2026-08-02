import { Popover } from "@opencode-ai/ui/popover"
import { useParams } from "@solidjs/router"
import { createMemo, createSignal, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSyncOptional } from "@/context/sync"
import { useProviders } from "@/hooks/use-providers"
import { getSessionContextMetrics } from "@/components/session/session-context-metrics"
import { isCloudMode } from "@/lib/cloud-mode"
import { createCloudUsage } from "@/context/cloud-usage"

const clamp = (value: number | null | undefined) => Math.max(0, Math.min(100, value ?? 0))

export function UsageSegment() {
  const params = useParams()
  const sync = useSyncOptional()
  const providers = useProviders()
  const language = useLanguage()
  const [shown, setShown] = createSignal(false)

  // Cloud usage (daily budget gauge)
  const cloud = createCloudUsage()
  const inCloud = isCloudMode()

  const id = createMemo(() => params.id)
  const number = createMemo(() => new Intl.NumberFormat(language.intl()))
  const compact = createMemo(
    () => new Intl.NumberFormat(language.intl(), { notation: "compact", maximumFractionDigits: 1 }),
  )
  const metrics = createMemo(() => getSessionContextMetrics(id() ? (sync?.data.message[id()!] ?? []) : [], providers.all()))
  const ctx = createMemo(() => metrics().context)
  const pct = createMemo(() => clamp(ctx()?.usage))
  const left = createMemo(() => {
    const value = ctx()
    if (!value?.limit) return undefined
    return Math.max(0, value.limit - value.total)
  })
  const cost = createMemo(() =>
    new Intl.NumberFormat(language.intl(), {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: metrics().totalCost > 0 && metrics().totalCost < 0.01 ? 4 : 2,
    }).format(metrics().totalCost),
  )
  const tone = createMemo(() => {
    if (pct() >= 90) return "bg-icon-critical-base"
    if (pct() >= 70) return "bg-icon-warning-base"
    return "bg-icon-success-base"
  })

  // Cloud budget gauge values
  const cloudPct = createMemo(() => {
    const d = cloud.data()
    if (!d.dailyBudget) return 100
    return d.percentRemaining
  })
  const cloudUsed = createMemo(() => cloud.data().usedTokens)
  const cloudBudget = createMemo(() => cloud.data().dailyBudget)
  const cloudTone = createMemo(() => {
    const p = cloudPct()
    if (p <= 5) return "bg-icon-critical-base"
    if (p <= 20) return "bg-icon-warning-base"
    return "bg-icon-info-base"
  })
  const cloudBarTone = createMemo(() => {
    const p = cloudPct()
    if (p <= 5) return "bg-icon-critical-base"
    if (p <= 20) return "bg-icon-warning-base"
    return "bg-icon-success-base"
  })
  const cloudResetLabel = createMemo(() => {
    const d = cloud.data()
    if (!d.resetsAt) return ""
    const diff = new Date(d.resetsAt).getTime() - Date.now()
    if (diff <= 0) return "now"
    const hours = Math.floor(diff / 3_600_000)
    const mins = Math.floor((diff % 3_600_000) / 60_000)
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  })

  return (
    <Show when={id()}>
      <Popover
        open={shown()}
        onOpenChange={setShown}
        placement="top-end"
        gutter={4}
        class="[&_[data-slot=popover-body]]:p-0 w-[320px] bg-transparent border-0 shadow-none rounded-xl"
        trigger={
          <button
            type="button"
            class="h-6 flex items-center gap-1.5 rounded-md px-2 text-[11px] hover:bg-white/5 transition-all duration-200 shrink-0"
            title="API usage"
          >
            {/* Cloud daily gauge (shown only in cloud mode) */}
            <Show when={inCloud && cloud.active}>
              <span class="uppercase tracking-wider opacity-40 font-semibold text-[9px]">☁</span>
              <div
                class="h-1.5 w-10 overflow-hidden rounded-full bg-surface-raised-base/80"
                role="progressbar"
                aria-label="Daily budget"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={cloudPct()}
              >
                <div class={`h-full transition-all duration-500 ${cloudBarTone()}`} style={{ width: `${cloudPct()}%` }} />
              </div>
              <span class="tabular-nums opacity-55">{cloudPct()}%</span>
              <span class="w-px h-3 bg-white/10 mx-0.5" />
            </Show>

            {/* Per-session gauge */}
            <span class="uppercase tracking-wider opacity-40 font-semibold">API</span>
            <span class="tabular-nums font-medium opacity-80">{cost()}</span>
            <div
              class="h-1.5 w-16 overflow-hidden rounded-full bg-surface-raised-base/80"
              role="progressbar"
              aria-label="Context usage"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={pct()}
            >
              <div class={`h-full transition-all duration-300 ${tone()}`} style={{ width: `${pct()}%` }} />
            </div>
            <span class="tabular-nums opacity-55">{ctx() ? `${pct()}%` : "—"}</span>
          </button>
        }
      >
        <Show when={shown()}>
          <div
            class="rounded-xl shadow-[var(--shadow-lg-border-base)] p-3 text-[12px] space-y-3"
            style={{ background: "var(--background-strong)" }}
          >
            {/* Cloud daily budget section */}
            <Show when={inCloud && cloud.active}>
              <div class="space-y-2 pb-2 border-b border-white/10">
                <div class="flex items-center justify-between gap-3">
                  <div class="font-semibold opacity-70 text-[10px] uppercase tracking-wide">Daily Budget</div>
                  <div class="tabular-nums text-[11px] opacity-60">{cloud.data().tier} tier</div>
                </div>
                <div class="flex justify-between gap-4 text-[11px]">
                  <span class="opacity-55">Used today</span>
                  <span class="tabular-nums font-medium">
                    {compact().format(cloudUsed())} / {compact().format(cloudBudget())} tokens
                  </span>
                </div>
                <div class="space-y-1.5">
                  <div class="flex justify-between gap-4 text-[11px]">
                    <span class="opacity-55">Remaining</span>
                    <span class="tabular-nums font-medium">{cloudPct()}%</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-surface-raised-base/80">
                    <div class={`h-full transition-all duration-500 ${cloudBarTone()}`} style={{ width: `${cloudPct()}%` }} />
                  </div>
                  <div class="flex justify-between gap-4 text-[10px] opacity-45">
                    <span>{cloud.data().requestCount} requests today</span>
                    <Show when={cloudResetLabel()}>
                      <span>Resets in {cloudResetLabel()}</span>
                    </Show>
                  </div>
                </div>
                <Show when={cloud.data().model}>
                  <div class="flex justify-between gap-4 text-[11px]">
                    <span class="opacity-55">Model</span>
                    <span class="truncate text-right font-medium">{cloud.data().model}</span>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Per-session usage (existing) */}
            <div class="flex items-center justify-between gap-3">
              <div class="font-semibold opacity-70 text-[10px] uppercase tracking-wide">Session Usage</div>
              <div class="tabular-nums text-[11px] opacity-60">{cost()}</div>
            </div>

            <div class="space-y-2">
              <div class="flex justify-between gap-4 text-[11px]">
                <span class="opacity-55">Session tokens</span>
                <span class="tabular-nums font-medium">{number().format(metrics().totalTokens)}</span>
              </div>
              <Show when={ctx()}>
                {(item) => (
                  <>
                    <div class="flex justify-between gap-4 text-[11px]">
                      <span class="opacity-55">Model</span>
                      <span class="truncate text-right font-medium">{item().modelLabel}</span>
                    </div>
                    <div class="flex justify-between gap-4 text-[11px]">
                      <span class="opacity-55">Provider</span>
                      <span class="truncate text-right font-medium">{item().providerLabel}</span>
                    </div>
                    <div class="flex justify-between gap-4 text-[11px]">
                      <span class="opacity-55">Last response</span>
                      <span class="tabular-nums font-medium">{number().format(item().total)} tokens</span>
                    </div>
                    <div class="space-y-1.5 pt-1">
                      <div class="flex justify-between gap-4 text-[11px]">
                        <span class="opacity-55">Context window</span>
                        <span class="tabular-nums font-medium">
                          {item().limit ? `${pct()}% used` : "Unknown"}
                        </span>
                      </div>
                      <div class="h-2 overflow-hidden rounded-full bg-surface-raised-base/80">
                        <div class={`h-full transition-all duration-300 ${tone()}`} style={{ width: `${pct()}%` }} />
                      </div>
                      <Show when={left() !== undefined}>
                        <div class="text-[10px] opacity-45">
                          {compact().format(left() ?? 0)} context tokens estimated remaining.
                        </div>
                      </Show>
                    </div>
                  </>
                )}
              </Show>
              <Show when={!ctx()}>
                <div class="text-[11px] opacity-55">No token usage recorded for this session yet.</div>
              </Show>
            </div>

            <div class="border-t border-white/10 pt-2 text-[10px] leading-4 opacity-45">
              <Show when={inCloud && cloud.active} fallback={
                <>Provider quota remaining is not exposed by the current provider API. This gauge tracks known session
                tokens, cost, and context-window pressure.</>
              }>
                Daily budget resets at midnight UTC. Use your own API key in settings to bypass limits.
              </Show>
            </div>
          </div>
        </Show>
      </Popover>
    </Show>
  )
}
