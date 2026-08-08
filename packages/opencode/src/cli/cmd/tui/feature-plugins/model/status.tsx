import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import type { Status } from "@/model"

export function ModelStatus(props: {
  api: TuiPluginApi
  status: Status
  name: string
  tokens: number
  active: boolean
}) {
  const theme = () => props.api.theme.current
  const [elapsed, setElapsed] = createSignal(0)

  createEffect(() => {
    if (!props.active) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Date.now() - start), 100)
    onCleanup(() => clearInterval(timer))
  })

  const rate = () => {
    const ms = elapsed()
    if (ms <= 0 || props.tokens <= 0) return "0.0"
    return (props.tokens / (ms / 1000)).toFixed(1)
  }

  const color = () => {
    if (props.status.state === "ready") return theme().success
    if (props.status.state === "loading") return theme().warning
    return theme().error
  }

  return (
    <box flexDirection="row" justifyContent="space-between" flexShrink={0} gap={1}>
      <box flexDirection="row" gap={1} flexShrink={1}>
        <text fg={theme().text}>
          <span style={{ fg: color() }}>●</span> {props.name}
        </text>
        <text fg={theme().textMuted}>{props.status.state}</text>
        <Show when={props.status.warm}>
          <text fg={theme().textMuted}>warm</text>
        </Show>
        <Show when={props.status.error}>
          <text fg={theme().error}>{props.status.error}</text>
        </Show>
      </box>
      <box flexDirection="row" gap={2} flexShrink={0}>
        <Show when={props.active && props.tokens > 0}>
          <text fg={theme().textMuted}>{props.tokens} tok</text>
          <text fg={theme().textMuted}>{rate()} tok/s</text>
          <text fg={theme().textMuted}>{(elapsed() / 1000).toFixed(1)}s</text>
        </Show>
        <Show when={props.status.ram > 0}>
          <text fg={theme().textMuted}>{Math.round(props.status.ram / 1024 / 1024)}MB</text>
        </Show>
        <text fg={theme().textMuted}>sessions {props.status.sessions}</text>
      </box>
    </box>
  )
}
