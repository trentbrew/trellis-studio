import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useSDK } from "@/context/sdk"
import { Globe, Zap, Terminal, Plus, Trash2, Play, Square, Wand2 } from "lucide-solid"
import type { ServiceInfo } from "@/context/preview"

type Draft = {
  name: string
  port: string
  type: "web" | "api" | "terminal"
  command: string
}

export function SettingsServices() {
  const sdk = useSDK()
  const qs = createMemo(() => `?directory=${encodeURIComponent(sdk.directory)}`)
  const [services, setServices] = createSignal<ServiceInfo[]>([])
  const [drafts, setDrafts] = createStore<Draft[]>([])
  const [inferring, setInferring] = createSignal(false)

  const refresh = async () => {
    try {
      const res = await sdk.fetch(`${sdk.url}/preview/services${qs()}`)
      if (res.ok) setServices(await res.json())
    } catch {}
  }

  createEffect(() => {
    void refresh()
  })

  const start = async (name: string) => {
    await sdk.fetch(`${sdk.url}/preview/services/${name}/start${qs()}`, { method: "POST" })
    await refresh()
  }

  const stop = async (name: string) => {
    await sdk.fetch(`${sdk.url}/preview/services/${name}/stop${qs()}`, { method: "POST" })
    await refresh()
  }

  const infer = async () => {
    setInferring(true)
    try {
      const res = await sdk.fetch(`${sdk.url}/preview/infer${qs()}`, { method: "POST" })
      if (res.ok) {
        const suggestions = (await res.json()) as { name: string; port: number; type: string; command: string }[]
        const existing = new Set(services().map((s) => s.name))
        const fresh = suggestions
          .filter((s) => !existing.has(s.name))
          .map((s) => ({
            name: s.name,
            port: String(s.port),
            type: s.type as "web" | "api" | "terminal",
            command: s.command,
          }))
        setDrafts([...drafts, ...fresh])
      }
    } finally {
      setInferring(false)
    }
  }

  const add = () => setDrafts([...drafts, { name: "", port: "3000", type: "web", command: "" }])
  const remove = (idx: number) => setDrafts(drafts.filter((_, i) => i !== idx))

  const icon = (type: string) => {
    if (type === "web") return Globe
    if (type === "api") return Zap
    return Terminal
  }

  const dot = (status: string) => {
    if (status === "running") return "var(--color-green-500)"
    if (status === "starting") return "var(--color-yellow-500)"
    if (status === "error") return "var(--color-red-500)"
    return "var(--text-weaker)"
  }

  return (
    <div class="settings-services">
      <div class="settings-services-header">
        <div>
          <div class="settings-services-title">Preview Services</div>
          <div class="settings-services-desc">Configure dev servers and preview services for this project.</div>
        </div>
        <div class="settings-services-actions">
          <button class="settings-services-btn" onClick={() => void infer()} disabled={inferring()}>
            <Wand2 class="size-3.5" />
            {inferring() ? "Scanning…" : "Auto-detect"}
          </button>
          <button class="settings-services-btn" onClick={add}>
            <Plus class="size-3.5" />
            Add
          </button>
        </div>
      </div>

      <Show when={services().length > 0}>
        <div class="settings-services-list">
          <For each={services()}>
            {(svc) => {
              const I = icon(svc.type)
              return (
                <div class="settings-services-item">
                  <span class="settings-services-dot" style={{ background: dot(svc.status) }} />
                  <I class="size-3.5 text-icon-weak" />
                  <span class="settings-services-name">{svc.name}</span>
                  <Show when={svc.port}>
                    <span class="settings-services-port">:{svc.port}</span>
                  </Show>
                  <span class="settings-services-cmd">{svc.command}</span>
                  <div class="settings-services-item-actions">
                    <Show when={svc.status === "running"}>
                      <button class="settings-services-icon-btn" onClick={() => void stop(svc.name)} title="Stop">
                        <Square class="size-3.5" />
                      </button>
                    </Show>
                    <Show when={svc.status === "stopped"}>
                      <button class="settings-services-icon-btn" onClick={() => void start(svc.name)} title="Start">
                        <Play class="size-3.5" />
                      </button>
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>
        </div>
      </Show>

      <Show when={drafts.length > 0}>
        <div class="settings-services-drafts-title">New services (add to opencode.jsonc)</div>
        <div class="settings-services-list">
          <For each={drafts}>
            {(draft, idx) => (
              <div class="settings-services-draft">
                <input
                  class="settings-services-input settings-services-input--name"
                  value={draft.name}
                  onInput={(e) => setDrafts(idx(), "name", e.currentTarget.value)}
                  placeholder="name"
                />
                <select
                  class="settings-services-select"
                  value={draft.type}
                  onChange={(e) => setDrafts(idx(), "type", e.currentTarget.value as "web" | "api" | "terminal")}
                >
                  <option value="web">web</option>
                  <option value="api">api</option>
                  <option value="terminal">terminal</option>
                </select>
                <input
                  class="settings-services-input settings-services-input--port"
                  value={draft.port}
                  onInput={(e) => setDrafts(idx(), "port", e.currentTarget.value)}
                  placeholder="port"
                  type="number"
                />
                <input
                  class="settings-services-input settings-services-input--cmd"
                  value={draft.command}
                  onInput={(e) => setDrafts(idx(), "command", e.currentTarget.value)}
                  placeholder="command"
                />
                <button class="settings-services-icon-btn settings-services-rm" onClick={() => remove(idx())}>
                  <Trash2 class="size-3.5" />
                </button>
              </div>
            )}
          </For>
        </div>
        <div class="settings-services-hint">
          Copy the configuration above into your <code>opencode.jsonc</code> under the <code>"preview"</code> key.
        </div>
      </Show>

      <Show when={services().length === 0 && drafts.length === 0}>
        <div class="settings-services-empty">
          No preview services configured. Click <strong>Auto-detect</strong> to scan your project or{" "}
          <strong>Add</strong> to configure manually.
        </div>
      </Show>
    </div>
  )
}
