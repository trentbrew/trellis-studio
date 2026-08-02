import { Popover } from "@opencode-ai/ui/popover"
import { Icon } from "@opencode-ai/ui/icon"
import { createSignal, For, Show } from "solid-js"
import { useActiveTaskOptional } from "@/context/active-task"
import { PRIORITY_COLOR } from "../colors"

export function ActiveIssueSegment() {
  const task = useActiveTaskOptional()
  const [shown, setShown] = createSignal(false)

  const issue = () => task?.activeIssue()
  const priorityColor = () => PRIORITY_COLOR[issue()?.priority ?? ""] ?? "var(--text-weak)"
  const criteriaPercent = () => {
    const i = issue()
    if (!i || !i.criteriaCount) return undefined
    return Math.round((i.criteriaPassed / i.criteriaCount) * 100)
  }
  const hasIssue = () => !!issue()

  return (
    <Show when={task && hasIssue()}>
      <Popover
        open={shown()}
        onOpenChange={setShown}
        placement="bottom-end"
        gutter={4}
        class="[&_[data-slot=popover-body]]:p-0 w-[320px] bg-transparent border-0 shadow-none rounded-xl"
        trigger={
          <div class="flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer hover:bg-[rgba(255,255,255,0.06)] transition-colors">
            <Show
              when={issue()}
              fallback={
                <>
                  <Icon name="checklist" size="small" class="text-text-weak" style={{ "font-size": "12px" }} />
                  <span class="text-[11px] text-text-weak">no active issue</span>
                </>
              }
            >
              {(i) => (
                <>
                  <span class="font-mono text-[10px] font-semibold shrink-0" style={{ color: priorityColor() }}>
                    {i().id}
                  </span>
                  <span class="opacity-80 whitespace-nowrap">{i().title}</span>
                  <Show when={criteriaPercent() !== undefined}>
                    <div
                      class="text-[10px] tabular-nums px-1 py-px rounded-full shrink-0"
                      style={{ background: "rgba(255,255,255,0.08)", color: "var(--text-weak)" }}
                    >
                      {criteriaPercent()}%
                    </div>
                  </Show>
                </>
              )}
            </Show>
          </div>
        }
      >
        <Show when={issue()}>
          {(i) => (
            <div
              class="rounded-xl shadow-[var(--shadow-lg-border-base)] p-3 text-[12px]"
              style={{ background: "var(--background-strong)" }}
            >
              <div class="font-semibold mb-1" style={{ color: priorityColor() }}>
                {i().id} · {i().priority}
              </div>
              <div class="mb-2 opacity-80">{i().title}</div>
              <Show when={i().description}>
                <p class="opacity-60 text-[11px] mb-2 line-clamp-3">{i().description}</p>
              </Show>
              <Show when={(i().criteria?.length ?? 0) > 0}>
                <div class="space-y-1">
                  <For each={i().criteria}>
                    {(c) => (
                      <div class="flex items-center gap-1.5">
                        <span
                          style={{
                            color: c.status === "passed" ? "var(--icon-success)" : "var(--text-weak)",
                          }}
                        >
                          {c.status === "passed" ? "✓" : "○"}
                        </span>
                        <span class="opacity-70 text-[11px] truncate">{c.description}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
              <div class="mt-2 pt-2 border-t border-white/10 flex gap-2">
                <button
                  class="text-[11px] px-2 py-0.5 rounded hover:bg-white/10 transition-colors opacity-70"
                  onClick={() => task?.setActiveIssue(undefined)}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </Show>
      </Popover>
    </Show>
  )
}
