import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { animate } from "motion"
import { Icon } from "@opencode-ai/ui/icon"
import { Spinner } from "@opencode-ai/ui/spinner"
import type { Message, Part, SessionStatus } from "@opencode-ai/sdk/v2/client"
import {
  type ActivityStep,
  type SessionActivitySnapshot,
  deriveSessionActivitySnapshot,
  formatElapsed,
} from "@/lib/session-activity-status"

type Tone = SessionActivitySnapshot["tone"]

const toneContainer = (t: Tone) => {
  if (t === "error") return "border-red-500/35 bg-red-500/[0.05]"
  if (t === "retry") return "border-amber-500/35 bg-amber-500/[0.05]"
  return "border-border-weaker-base bg-background-stronger/85"
}

const toneAccent = (t: Tone) => {
  if (t === "error") return "text-red-400"
  if (t === "retry") return "text-amber-400"
  return "text-text-weak"
}

const stepStyles = {
  done: { mark: "✓", text: "text-text-weaker", icon: "text-emerald-400" },
  active: { mark: "→", text: "text-text-base", icon: "text-text-base" },
  error: { mark: "✕", text: "text-red-400", icon: "text-red-400" },
} satisfies Record<ActivityStep["status"], { mark: string; text: string; icon: string }>

function DancingDots(props: { tone: Tone }) {
  const color = () => {
    if (props.tone === "error") return "rgb(248 113 113)"
    if (props.tone === "retry") return "rgb(251 191 36)"
    return "currentColor"
  }
  return (
    <span class="inline-flex items-center gap-[3px] ml-1.5 shrink-0" aria-hidden="true">
      <span
        class="size-[3px] rounded-full"
        style={{
          "background-color": color(),
          animation: "pulse-opacity 1.1s ease-in-out infinite",
          "animation-delay": "-0.30s",
        }}
      />
      <span
        class="size-[3px] rounded-full"
        style={{
          "background-color": color(),
          animation: "pulse-opacity 1.1s ease-in-out infinite",
          "animation-delay": "-0.15s",
        }}
      />
      <span
        class="size-[3px] rounded-full"
        style={{
          "background-color": color(),
          animation: "pulse-opacity 1.1s ease-in-out infinite",
          "animation-delay": "0s",
        }}
      />
    </span>
  )
}

function StepRow(props: { step: ActivityStep }) {
  let ref: HTMLLIElement | undefined
  // Entry animation runs once per mounted row. Stable step references
  // (cached by id in the parent memo) prevent this from re-firing on every
  // snapshot tick, which previously caused the flicker.
  createEffect(() => {
    if (!ref) return
    requestAnimationFrame(() =>
      animate(ref as Element, { opacity: [0, 1], y: [-3, 0] }, { type: "spring", stiffness: 480, damping: 32 } as any),
    )
  })
  const style = () => stepStyles[props.step.status]
  return (
    <li ref={ref} class="flex min-w-0 items-start gap-1.5 text-11-regular transition-colors duration-200">
      <span
        class={`shrink-0 inline-flex w-3 justify-center font-mono leading-[1.45] ${style().icon}`}
        classList={{ "animate-pulse": props.step.status === "active" }}
        aria-hidden="true"
      >
        {style().mark}
      </span>
      <span class={`truncate ${style().text}`}>{props.step.label}</span>
    </li>
  )
}

export function SessionActivityIndicator(props: {
  color?: string
  status: SessionStatus
  messages: Message[]
  partsByMessage: Record<string, Part[] | undefined>
}) {
  const [now, setNow] = createSignal(Date.now())
  const [collapsed, setCollapsed] = createSignal(true)

  createEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })

  const snapshot = createMemo(() =>
    deriveSessionActivitySnapshot({
      status: props.status,
      messages: props.messages,
      partsByMessage: props.partsByMessage,
      now: now(),
    }),
  )

  const elapsed = createMemo(() => formatElapsed(snapshot()?.elapsedMs))

  // Cache step objects by id so <For> sees stable references when the
  // underlying step (id + label + status) is unchanged. This is the fix
  // for the flicker — previously every snapshot tick created new objects
  // and remounted every <For> row.
  const stepCache = new Map<string, ActivityStep>()
  const stableSteps = createMemo<ActivityStep[]>(() => {
    const next = snapshot()?.steps ?? []
    const seen = new Set<string>()
    const out: ActivityStep[] = []
    for (const step of next) {
      seen.add(step.id)
      const cached = stepCache.get(step.id)
      if (cached && cached.label === step.label && cached.status === step.status) {
        out.push(cached)
      } else {
        stepCache.set(step.id, step)
        out.push(step)
      }
    }
    for (const id of stepCache.keys()) if (!seen.has(id)) stepCache.delete(id)
    return out
  })

  return (
    <Show when={snapshot()}>
      {(current) => {
        const tone = createMemo(() => current().tone)
        const visibleSteps = createMemo(() => stableSteps().slice(-4))
        const hasBody = createMemo(() => !!current().detail || visibleSteps().length > 0)

        return (
          <div
            class={`group/indicator relative w-full overflow-hidden rounded-lg border backdrop-blur-sm transition-[border-color,background-color,box-shadow] duration-300 ease-out ${toneContainer(tone())}`}
            style={{
              "box-shadow":
                tone() === "error"
                  ? "0 1px 0 rgba(0,0,0,0.04), 0 0 0 1px rgba(248,113,113,0.06)"
                  : tone() === "retry"
                    ? "0 1px 0 rgba(0,0,0,0.04), 0 0 0 1px rgba(251,191,36,0.06)"
                    : "0 1px 0 rgba(0,0,0,0.04)",
            }}
            aria-live="polite"
            aria-busy="true"
          >
            <button
              type="button"
              class="flex w-full min-w-0 items-start gap-2 px-3 pt-2.5 pb-2 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-base"
              classList={{ "pb-2.5": collapsed() || !hasBody() }}
              onClick={() => hasBody() && setCollapsed((v) => !v)}
              aria-expanded={hasBody() ? !collapsed() : undefined}
              aria-disabled={!hasBody()}
            >
              <Spinner
                class="size-3.5 mt-0.5 shrink-0 transition-colors duration-200"
                style={{ color: props.color ?? "currentColor" }}
              />
              <div class="min-w-0 flex-1">
                <div class="flex min-w-0 items-center gap-1">
                  <span class="text-12-medium text-text-strong truncate">{current().primary}</span>
                  <DancingDots tone={tone()} />
                  <Show when={elapsed()}>
                    <span class="text-11-regular text-text-weaker shrink-0 tabular-nums ml-auto pl-2">{elapsed()}</span>
                  </Show>
                </div>
                <Show when={current().secondary}>
                  <div
                    class="text-11-regular text-text-weak truncate transition-opacity duration-200"
                    classList={{ "opacity-60": collapsed() }}
                  >
                    {current().secondary}
                  </div>
                </Show>
              </div>
              <Show when={hasBody()}>
                <Icon
                  name="chevron-down"
                  class="size-3.5 mt-1 shrink-0 text-text-weaker transition-transform duration-200 ease-out group-hover/indicator:text-text-weak"
                  classList={{ "-rotate-90": collapsed() }}
                />
              </Show>
            </button>

            <div
              class="grid transition-[grid-template-rows,opacity] duration-250 ease-out"
              style={{
                "grid-template-rows": collapsed() || !hasBody() ? "0fr" : "1fr",
                opacity: collapsed() || !hasBody() ? 0 : 1,
              }}
              aria-hidden={collapsed() || !hasBody()}
            >
              <div class="overflow-hidden">
                <div class="px-3 pb-2.5 flex flex-col gap-2">
                  <Show when={current().detail}>
                    <div class={`text-11-regular break-words ${toneAccent(tone())}`}>{current().detail}</div>
                  </Show>
                  <Show when={visibleSteps().length > 0}>
                    <ul class="flex flex-col gap-1">
                      <For each={visibleSteps()}>{(step) => <StepRow step={step} />}</For>
                    </ul>
                  </Show>
                </div>
              </div>
            </div>
          </div>
        )
      }}
    </Show>
  )
}
