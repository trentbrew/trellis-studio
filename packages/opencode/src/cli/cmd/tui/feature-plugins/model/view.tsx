import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { TextareaRenderable } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Model, type Info, type Message, type Status, type Trust } from "@/model"
import { Spinner } from "../../component/spinner"
import { ModelStatus } from "./status"

type Phase = "connecting" | "ready" | "error"

const SYSTEM: Message = { role: "system", content: "You are a helpful assistant." }

export function ModelView(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const renderer = useRenderer()
  const selector = Model.selector()
  const session = crypto.randomUUID()

  const [phase, setPhase] = createSignal<Phase>("connecting")
  const [scan, setScan] = createSignal("scanning for a running backend...")
  const [fault, setFault] = createSignal("")
  const [backend, setBackend] = createSignal<Info>()
  const [status, setStatus] = createSignal<Status>(Model.IDLE)
  const [busy, setBusy] = createSignal(false)
  const [trust, setTrust] = createSignal<Trust>("fast")
  const [tokens, setTokens] = createSignal(0)
  const [thinking, setThinking] = createSignal("")
  const [store, setStore] = createStore({ messages: [] as Message[] })

  let input: TextareaRenderable | undefined
  let live = true
  onCleanup(() => {
    live = false
    void selector.provider?.shutdown()
  })

  const connect = async () => {
    setPhase("connecting")
    setFault("")
    const found = await Model.detect()
    if (!live) return
    const hit = found.find((x) => x.available)
    setScan(hit ? `${hit.name} detected — loading weights...` : "no backend running")

    const next = await selector.select().catch((err: unknown) => (err instanceof Error ? err : new Error(String(err))))
    if (!live) return
    if (next instanceof Error) {
      setFault(next.message)
      setPhase("error")
      return
    }
    setBackend(next.backend)
    setStatus(next.provider.status())
    setPhase("ready")
    setTimeout(() => {
      if (!input || input.isDestroyed) return
      input.focus()
    }, 1)
  }

  onMount(() => {
    void connect()
    const timer = setInterval(() => setStatus(selector.status()), 500)
    onCleanup(() => clearInterval(timer))
  })

  const send = async (text: string) => {
    const prompt = text.trim()
    if (!prompt || busy()) return
    const provider = selector.provider
    if (!provider) return

    input?.setText("")
    setTokens(0)
    setThinking("")
    setBusy(true)
    setStore("messages", (prev) => [...prev, { role: "user" as const, content: prompt }])

    const req = {
      session,
      messages: [SYSTEM, ...store.messages],
      config: Model.DEFAULTS,
      trust: trust(),
    }

    try {
      for await (const delta of provider.generate(req)) {
        if (!live) return
        // Reasoning is progress, not answer — show the tail of it and move on.
        if (delta.thinking) {
          setThinking((prev) => (prev + delta.text).slice(-120))
          renderer.requestRender()
          continue
        }
        if (delta.first) {
          setThinking("")
          setStore("messages", (prev) => [...prev, { role: "assistant" as const, content: "" }])
        }
        if (!delta.text) continue
        setTokens((x) => x + 1)
        setStore(
          "messages",
          produce((list: Message[]) => {
            const last = list[list.length - 1]
            if (last?.role === "assistant") last.content += delta.text
          }),
        )
        renderer.requestRender()
      }
    } catch (err) {
      setStore("messages", (prev) => [
        ...prev,
        { role: "assistant" as const, content: `⚠ ${err instanceof Error ? err.message : String(err)}` },
      ])
    } finally {
      setBusy(false)
      setThinking("")
      renderer.requestRender()
    }
  }

  const name = createMemo(() => backend()?.name ?? "model")

  return (
    <box width="100%" height="100%" flexDirection="column" gap={1} paddingLeft={1} paddingRight={1}>
      <Switch>
        <Match when={phase() === "connecting"}>
          <box flexGrow={1} alignItems="center" justifyContent="center" gap={1}>
            <Spinner color={theme().textMuted}>{scan()}</Spinner>
            <text fg={theme().textMuted}>the model runs in its own process — we only connect, never spawn</text>
          </box>
        </Match>

        <Match when={phase() === "error"}>
          <box flexGrow={1} alignItems="center" justifyContent="center" gap={1}>
            <text fg={theme().error}>No model backend available</text>
            <text fg={theme().textMuted}>{fault()}</text>
            <box
              backgroundColor={theme().backgroundElement}
              paddingLeft={1}
              paddingRight={1}
              onMouseUp={() => void connect()}
            >
              <text fg={theme().text}>retry detection</text>
            </box>
          </box>
        </Match>

        <Match when={phase() === "ready"}>
          <ModelStatus api={props.api} status={status()} name={name()} tokens={tokens()} active={busy()} />
          <scrollbox flexGrow={1}>
            <box flexDirection="column" gap={1}>
              <For each={store.messages}>
                {(item) => (
                  <box flexDirection="column">
                    <text fg={item.role === "user" ? theme().primary : theme().success}>
                      {item.role === "user" ? "you" : name()}
                    </text>
                    <text fg={theme().text}>{item.content}</text>
                  </box>
                )}
              </For>
              <Show when={busy() && tokens() === 0}>
                <Spinner color={theme().textMuted}>
                  {thinking() ? `thinking: ${thinking().replace(/\s+/g, " ").trim()}` : "waiting for first token..."}
                </Spinner>
              </Show>
            </box>
          </scrollbox>
          <textarea
            ref={(val: TextareaRenderable) => (input = val)}
            height={3}
            placeholder={busy() ? "generating..." : "ask the model — enter to send"}
            placeholderColor={theme().textMuted}
            textColor={busy() ? theme().textMuted : theme().text}
            focusedTextColor={busy() ? theme().textMuted : theme().text}
            keyBindings={busy() ? [] : [{ name: "return", action: "submit" }]}
            onSubmit={() => void send(input?.plainText ?? "")}
          />
          <box flexDirection="row" gap={2} flexShrink={0}>
            <text fg={theme().text} onMouseUp={() => setTrust(trustToggle)}>
              trust <span style={{ fg: theme().textMuted }}>{trust()}</span>
            </text>
            <text fg={theme().textMuted}>session {session.slice(0, 8)}</text>
            <text fg={theme().textMuted}>enter send</text>
          </box>
        </Match>
      </Switch>
    </box>
  )
}

export function trustToggle(current: Trust): Trust {
  return current === "fast" ? "full" : "fast"
}
