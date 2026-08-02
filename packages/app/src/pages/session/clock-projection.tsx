import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { showToast } from "@opencode-ai/ui/toast"
import { Persist, persisted } from "@/utils/persist"
import { AffordanceShell } from "@/components/affordance"

type ClockTab = "clock" | "alarms" | "timer" | "stopwatch"

type Alarm = {
  id: string
  time: string // HH:MM (24h)
  label: string
  enabled: boolean
}

function pad(n: number, len = 2) {
  return n.toString().padStart(len, "0")
}

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function beep() {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.6)
    osc.onended = () => ctx.close().catch(() => {})
  } catch {
    // best-effort; audio is optional
  }
}

const TABS: { id: ClockTab; label: string }[] = [
  { id: "clock", label: "Clock" },
  { id: "alarms", label: "Alarms" },
  { id: "timer", label: "Timer" },
  { id: "stopwatch", label: "Stopwatch" },
]

export function ClockProjection() {
  const [tab, setTab] = createSignal<ClockTab>("clock")

  return (
    <AffordanceShell
      id="clock"
      title="Clock"
      tabs={TABS}
      tab={tab()}
      onTab={(id) => setTab(id as ClockTab)}
    >
      <Show when={tab() === "clock"}>
        <WorldClock />
      </Show>
      <Show when={tab() === "alarms"}>
        <Alarms />
      </Show>
      <Show when={tab() === "timer"}>
        <Timer />
      </Show>
      <Show when={tab() === "stopwatch"}>
        <Stopwatch />
      </Show>
    </AffordanceShell>
  )
}

function WorldClock() {
  const [now, setNow] = createSignal(new Date())
  onMount(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    onCleanup(() => window.clearInterval(id))
  })
  const time = createMemo(() => {
    const d = now()
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  })
  const date = createMemo(() =>
    now().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
  )
  const zone = createMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  return (
    <div class="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
      <div class="font-mono text-[clamp(2.5rem,9vw,5rem)] font-semibold leading-none tabular-nums text-text-strong">
        {time()}
      </div>
      <div class="text-14-regular text-text-base">{date()}</div>
      <div class="text-12-regular text-text-weaker">{zone()}</div>
    </div>
  )
}

function Stopwatch() {
  const [elapsed, setElapsed] = createSignal(0)
  const [running, setRunning] = createSignal(false)
  const [laps, setLaps] = createSignal<number[]>([])
  let raf = 0
  let startedAt = 0
  let base = 0

  const loop = () => {
    setElapsed(base + (performance.now() - startedAt))
    raf = requestAnimationFrame(loop)
  }
  const start = () => {
    if (running()) return
    setRunning(true)
    startedAt = performance.now()
    raf = requestAnimationFrame(loop)
  }
  const stop = () => {
    if (!running()) return
    cancelAnimationFrame(raf)
    base = elapsed()
    setRunning(false)
  }
  const reset = () => {
    cancelAnimationFrame(raf)
    base = 0
    startedAt = 0
    setElapsed(0)
    setRunning(false)
    setLaps([])
  }
  const lap = () => setLaps((prev) => [elapsed(), ...prev])
  onCleanup(() => cancelAnimationFrame(raf))

  const fmt = (ms: number) => {
    const total = Math.floor(ms)
    const m = Math.floor(total / 60000)
    const s = Math.floor((total % 60000) / 1000)
    const cs = Math.floor((total % 1000) / 10)
    return `${pad(m)}:${pad(s)}.${pad(cs)}`
  }

  return (
    <div class="flex h-full flex-col items-center gap-6 py-8">
      <div class="font-mono text-[clamp(2.25rem,8vw,4.5rem)] font-semibold tabular-nums text-text-strong">
        {fmt(elapsed())}
      </div>
      <div class="flex items-center gap-2">
        <Show when={!running()} fallback={<Button onClick={stop}>Stop</Button>}>
          <Button onClick={start}>Start</Button>
        </Show>
        <Button variant="ghost" onClick={lap} disabled={!running()}>
          Lap
        </Button>
        <Button variant="ghost" onClick={reset} disabled={elapsed() === 0 && laps().length === 0}>
          Reset
        </Button>
      </div>
      <Show when={laps().length > 0}>
        <div class="w-full max-w-sm flex flex-col gap-1">
          <For each={laps()}>
            {(value, i) => (
              <div class="flex items-center justify-between rounded-md px-3 py-1.5 text-13-regular text-text-base odd:bg-surface-raised-base/30">
                <span class="text-text-weak">Lap {laps().length - i()}</span>
                <span class="font-mono tabular-nums">{fmt(value)}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

function Timer() {
  const [minutes, setMinutes] = createSignal(5)
  const [seconds, setSeconds] = createSignal(0)
  const [remaining, setRemaining] = createSignal(0)
  const [running, setRunning] = createSignal(false)
  let interval = 0

  const tick = () => {
    setRemaining((prev) => {
      if (prev <= 1000) {
        window.clearInterval(interval)
        setRunning(false)
        beep()
        showToast({ title: "Timer finished", variant: "success" })
        return 0
      }
      return prev - 1000
    })
  }
  const start = () => {
    const total = remaining() > 0 ? remaining() : (minutes() * 60 + seconds()) * 1000
    if (total <= 0) return
    setRemaining(total)
    setRunning(true)
    window.clearInterval(interval)
    interval = window.setInterval(tick, 1000)
  }
  const pause = () => {
    window.clearInterval(interval)
    setRunning(false)
  }
  const reset = () => {
    window.clearInterval(interval)
    setRunning(false)
    setRemaining(0)
  }
  onCleanup(() => window.clearInterval(interval))

  const display = createMemo(() => {
    const total = Math.ceil((remaining() > 0 ? remaining() : (minutes() * 60 + seconds()) * 1000) / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
  })

  const numberField = (value: () => number, set: (n: number) => void, max: number, label: string) => (
    <label class="flex flex-col items-center gap-1">
      <input
        type="number"
        min={0}
        max={max}
        value={value()}
        disabled={running() || remaining() > 0}
        onInput={(e) => set(Math.max(0, Math.min(max, Number(e.currentTarget.value) || 0)))}
        class="w-20 rounded-md border border-border-weak-base bg-background-base px-2 py-1.5 text-center font-mono text-16-regular text-text-strong outline-none focus:border-border-strong-base disabled:opacity-50"
      />
      <span class="text-11-regular text-text-weaker">{label}</span>
    </label>
  )

  return (
    <div class="flex h-full flex-col items-center gap-6 py-8">
      <div class="font-mono text-[clamp(2.25rem,8vw,4.5rem)] font-semibold tabular-nums text-text-strong">
        {display()}
      </div>
      <Show
        when={running() || remaining() > 0}
        fallback={
          <div class="flex items-end gap-3">
            {numberField(minutes, setMinutes, 999, "min")}
            {numberField(seconds, setSeconds, 59, "sec")}
          </div>
        }
      >
        <div class="h-[58px]" aria-hidden="true" />
      </Show>
      <div class="flex items-center gap-2">
        <Show when={!running()} fallback={<Button onClick={pause}>Pause</Button>}>
          <Button onClick={start}>Start</Button>
        </Show>
        <Button variant="ghost" onClick={reset} disabled={!running() && remaining() === 0}>
          Reset
        </Button>
      </div>
    </div>
  )
}

function Alarms() {
  const [store, setStore] = persisted(
    Persist.global("affordance.clock.alarms"),
    createStore<{ items: Alarm[] }>({ items: [] }),
  )
  const [time, setTime] = createSignal("07:00")
  const [label, setLabel] = createSignal("")
  const fired = new Set<string>()

  onMount(() => {
    const id = window.setInterval(() => {
      const d = new Date()
      const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
      const stamp = `${d.toDateString()} ${hhmm}`
      for (const alarm of store.items) {
        if (!alarm.enabled || alarm.time !== hhmm) continue
        const key = `${alarm.id}@${stamp}`
        if (fired.has(key)) continue
        fired.add(key)
        beep()
        showToast({ title: alarm.label || "Alarm", description: alarm.time, variant: "default" })
      }
    }, 1000)
    onCleanup(() => window.clearInterval(id))
  })

  const add = () => {
    if (!/^\d{2}:\d{2}$/.test(time())) return
    setStore("items", (items) => [
      ...items,
      { id: uid(), time: time(), label: label().trim(), enabled: true },
    ])
    setLabel("")
  }
  const toggle = (id: string) =>
    setStore("items", (item) => item.id === id, "enabled", (v) => !v)
  const remove = (id: string) => setStore("items", (items) => items.filter((a) => a.id !== id))

  const sorted = createMemo(() => [...store.items].sort((a, b) => a.time.localeCompare(b.time)))

  return (
    <div class="flex h-full flex-col gap-4 py-4">
      <div class="flex items-end gap-2">
        <label class="flex flex-col gap-1">
          <span class="text-11-regular text-text-weaker">Time</span>
          <input
            type="time"
            value={time()}
            onInput={(e) => setTime(e.currentTarget.value)}
            class="rounded-md border border-border-weak-base bg-background-base px-2 py-1.5 font-mono text-14-regular text-text-strong outline-none focus:border-border-strong-base"
          />
        </label>
        <label class="flex flex-1 flex-col gap-1">
          <span class="text-11-regular text-text-weaker">Label</span>
          <input
            type="text"
            value={label()}
            placeholder="Wake up"
            onInput={(e) => setLabel(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            class="rounded-md border border-border-weak-base bg-background-base px-2 py-1.5 text-14-regular text-text-strong outline-none placeholder:text-text-weaker focus:border-border-strong-base"
          />
        </label>
        <Button onClick={add}>Add</Button>
      </div>

      <Show
        when={sorted().length > 0}
        fallback={<div class="flex-1 flex items-center justify-center text-13-regular text-text-weak">No alarms yet.</div>}
      >
        <div class="flex flex-col gap-1.5">
          <For each={sorted()}>
            {(alarm) => (
              <div
                class="flex items-center gap-3 rounded-lg border border-border-weaker-base bg-surface-raised-base/30 px-3 py-2"
                classList={{ "opacity-50": !alarm.enabled }}
              >
                <div class="font-mono text-20-medium tabular-nums text-text-strong">{alarm.time}</div>
                <div class="flex-1 truncate text-13-regular text-text-base">{alarm.label || "Alarm"}</div>
                <button
                  type="button"
                  onClick={() => toggle(alarm.id)}
                  class="relative h-5 w-9 shrink-0 rounded-full transition-colors"
                  classList={{
                    "bg-[var(--text-accent,var(--border-strong-base))]": alarm.enabled,
                    "bg-surface-raised-base": !alarm.enabled,
                  }}
                  aria-label={alarm.enabled ? "Disable alarm" : "Enable alarm"}
                  aria-pressed={alarm.enabled}
                >
                  <span
                    class="absolute top-0.5 size-4 rounded-full bg-background-base shadow-sm transition-all"
                    classList={{ "left-[18px]": alarm.enabled, "left-0.5": !alarm.enabled }}
                  />
                </button>
                <Button size="small" variant="ghost" onClick={() => remove(alarm.id)}>
                  Remove
                </Button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
