import { Popover } from "@opencode-ai/ui/popover"
import { createMemo, createSignal, Show, For } from "solid-js"
import { useTrellisOptional } from "@/context/trellis"

const reducedMotion = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : true

export function SuggestionsSegment() {
  const trellis = useTrellisOptional()
  const [shown, setShown] = createSignal(false)

  const count = createMemo(() => trellis?.suggestions?.length ?? 0)
  const hasSuggestions = createMemo(() => count() > 0)
  const suggestions = createMemo(() => trellis?.suggestions?.slice(0, 5) ?? [])

  const highPriorityCount = createMemo(() =>
    trellis?.suggestions?.filter((s) => s.priority === "high").length ?? 0
  )

  return (
    <Show when={hasSuggestions()}>
      <Popover
        open={shown()}
        onOpenChange={setShown}
        placement="bottom-end"
        gutter={4}
        class="[&_[data-slot=popover-body]]:p-0 w-[340px] bg-transparent border-0 shadow-none rounded-xl"
        trigger={
          <div
            class="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:bg-white/5 transition-all duration-200 group"
            classList={{
              "animate-pulse": !reducedMotion && highPriorityCount() > 0,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="transition-transform duration-200 group-hover:scale-110"
              style={{ color: highPriorityCount() > 0 ? "var(--icon-warning)" : "var(--icon-info)" }}
            >
              <path d="M12 2v4" />
              <path d="m5 5 2.8 2.8" />
              <path d="m19 5-2.8 2.8" />
              <circle cx="12" cy="13" r="3" />
              <path d="M12 16v5" />
            </svg>
            <span
              class="text-[11px] font-medium tabular-nums"
              style={{ color: highPriorityCount() > 0 ? "var(--icon-warning)" : "var(--text-weak)" }}
            >
              {count()}
            </span>
            <span class="text-[10px] opacity-60">suggestions</span>
            <Show when={highPriorityCount() > 0}>
              <span
                class="text-[9px] px-1 py-0.5 rounded-full font-semibold animate-in-fade"
                style={{ background: "rgba(239, 68, 68, 0.2)", color: "rgb(239, 68, 68)" }}
              >
                {highPriorityCount()} high
              </span>
            </Show>
          </div>
        }
      >
        <Show when={shown()}>
          <div
            class="rounded-xl shadow-[var(--shadow-lg-border-base)] p-4 text-[12px] animate-in-slide-up"
            style={{ background: "var(--background-strong)" }}
          >
            <div class="flex items-center gap-2 mb-3">
              <span class="text-[11px] font-semibold">Active Suggestions</span>
              <span
                class="text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(255,255,255,0.1)" }}
              >
                {count()}
              </span>
            </div>

            <div class="space-y-2 max-h-[240px] overflow-y-auto">
              <For each={suggestions()}>
                {(suggestion, i) => (
                  <div
                    class="flex items-start gap-2 p-2 rounded-lg transition-all duration-200 hover:bg-white/5"
                    classList={{
                      "animate-in-slide-up": !reducedMotion,
                    }}
                    style={{ "animation-delay": `${i() * 50}ms` }}
                  >
                    <div
                      class="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                      style={{
                        background:
                          suggestion.priority === "high"
                            ? "rgb(239, 68, 68)"
                            : suggestion.priority === "medium"
                              ? "rgb(234, 179, 8)"
                              : "rgb(34, 197, 94)",
                      }}
                    />
                    <div class="min-w-0 flex-1">
                      <div class="text-[11px] leading-relaxed opacity-90">{suggestion.description}</div>
                      <div class="flex items-center gap-2 mt-1">
                        <span class="text-[9px] opacity-50 uppercase">{suggestion.ruleId}</span>
                        <Show when={suggestion.entityId}>
                          <span class="text-[9px] opacity-40 font-mono">{suggestion.entityId}</span>
                        </Show>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </div>

            <Show when={count() > 5}>
              <div class="mt-3 pt-3 border-t border-white/10 text-center">
                <span class="text-[10px] opacity-50">+{count() - 5} more suggestions</span>
              </div>
            </Show>

            <div class="mt-3 pt-3 border-t border-white/10 text-[10px] opacity-50">
              Proactive watcher detects stale issues, orphan work units, and other patterns
            </div>
          </div>
        </Show>
      </Popover>
    </Show>
  )
}
