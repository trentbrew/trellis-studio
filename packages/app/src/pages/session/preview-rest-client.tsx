import { createSignal, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Icon } from "@opencode-ai/ui/icon"

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

type Header = { key: string; value: string }

type HistoryEntry = {
  method: Method
  url: string
  status: number
  time: number
  timestamp: number
}

type ResponseData = {
  status: number
  headers: Record<string, string>
  body: string
  time: number
}

export function PreviewRestClient(props: { url: string }) {
  const [method, setMethod] = createSignal<Method>("GET")
  const [url, setUrl] = createSignal(props.url)
  const [body, setBody] = createSignal("")
  const [headers, setHeaders] = createStore<Header[]>([{ key: "Content-Type", value: "application/json" }])
  const [response, setResponse] = createSignal<ResponseData | undefined>()
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | undefined>()
  const [history, setHistory] = createStore<HistoryEntry[]>([])
  const [tab, setTab] = createSignal<"headers" | "body">("body")
  const [resTab, setResTab] = createSignal<"body" | "headers">("body")

  const methods: Method[] = ["GET", "POST", "PUT", "PATCH", "DELETE"]

  const send = async () => {
    setLoading(true)
    setError(undefined)
    setResponse(undefined)

    const start = performance.now()
    try {
      const opts: RequestInit = {
        method: method(),
        headers: Object.fromEntries(headers.filter((h) => h.key).map((h) => [h.key, h.value])),
      }
      if (method() !== "GET" && method() !== "DELETE" && body().trim()) {
        opts.body = body()
      }

      const res = await fetch(url(), opts)
      const elapsed = Math.round(performance.now() - start)
      const text = await res.text()
      const resHeaders: Record<string, string> = {}
      res.headers.forEach((v, k) => {
        resHeaders[k] = v
      })

      setResponse({ status: res.status, headers: resHeaders, body: text, time: elapsed })

      setHistory(
        produce((h) => {
          h.unshift({ method: method(), url: url(), status: res.status, time: elapsed, timestamp: Date.now() })
          if (h.length > 50) h.length = 50
        }),
      )
    } catch (err) {
      const elapsed = Math.round(performance.now() - start)
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }

  const addHeader = () => setHeaders(headers.length, { key: "", value: "" })
  const removeHeader = (idx: number) =>
    setHeaders(produce((h) => { h.splice(idx, 1) }))

  const format = (text: string) => {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }

  const statusColor = (code: number) => {
    if (code < 300) return "var(--color-green-500)"
    if (code < 400) return "var(--color-yellow-500)"
    return "var(--color-red-500)"
  }

  return (
    <div class="preview-rest">
      <div class="preview-rest-bar">
        <select
          class="preview-rest-method"
          value={method()}
          onChange={(e) => setMethod(e.currentTarget.value as Method)}
        >
          <For each={methods}>{(m) => <option value={m}>{m}</option>}</For>
        </select>
        <input
          class="preview-rest-url"
          type="text"
          value={url()}
          onInput={(e) => setUrl(e.currentTarget.value)}
          placeholder="http://localhost:4000/api"
          onKeyDown={(e) => { if (e.key === "Enter") void send() }}
        />
        <button class="preview-rest-send" onClick={() => void send()} disabled={loading()}>
          {loading() ? "…" : "Send"}
        </button>
      </div>

      <div class="preview-rest-tabs">
        <button
          class="preview-rest-tab"
          classList={{ "preview-rest-tab--active": tab() === "body" }}
          onClick={() => setTab("body")}
        >
          Body
        </button>
        <button
          class="preview-rest-tab"
          classList={{ "preview-rest-tab--active": tab() === "headers" }}
          onClick={() => setTab("headers")}
        >
          Headers
        </button>
      </div>

      <Show when={tab() === "body"}>
        <textarea
          class="preview-rest-body"
          value={body()}
          onInput={(e) => setBody(e.currentTarget.value)}
          placeholder='{"key": "value"}'
          rows={6}
        />
      </Show>

      <Show when={tab() === "headers"}>
        <div class="preview-rest-headers">
          <For each={headers}>
            {(h, idx) => (
              <div class="preview-rest-header-row">
                <input
                  class="preview-rest-header-key"
                  value={h.key}
                  onInput={(e) => setHeaders(idx(), "key", e.currentTarget.value)}
                  placeholder="Header name"
                />
                <input
                  class="preview-rest-header-val"
                  value={h.value}
                  onInput={(e) => setHeaders(idx(), "value", e.currentTarget.value)}
                  placeholder="Value"
                />
                <button class="preview-rest-header-rm" onClick={() => removeHeader(idx())}>
                  ×
                </button>
              </div>
            )}
          </For>
          <button class="preview-rest-header-add" onClick={addHeader}>
            + Add header
          </button>
        </div>
      </Show>

      <Show when={error()}>
        <div class="preview-rest-error">{error()}</div>
      </Show>

      <Show when={response()}>
        {(res) => (
          <div class="preview-rest-response">
            <div class="preview-rest-response-meta">
              <span class="preview-rest-status" style={{ color: statusColor(res().status) }}>
                {res().status}
              </span>
              <span class="preview-rest-time">{res().time}ms</span>
            </div>
            <div class="preview-rest-tabs">
              <button
                class="preview-rest-tab"
                classList={{ "preview-rest-tab--active": resTab() === "body" }}
                onClick={() => setResTab("body")}
              >
                Body
              </button>
              <button
                class="preview-rest-tab"
                classList={{ "preview-rest-tab--active": resTab() === "headers" }}
                onClick={() => setResTab("headers")}
              >
                Headers
              </button>
            </div>
            <Show when={resTab() === "body"}>
              <pre class="preview-rest-response-body">{format(res().body)}</pre>
            </Show>
            <Show when={resTab() === "headers"}>
              <div class="preview-rest-response-headers">
                <For each={Object.entries(res().headers)}>
                  {([k, v]) => (
                    <div class="preview-rest-response-header">
                      <span class="preview-rest-response-header-key">{k}</span>
                      <span class="preview-rest-response-header-val">{v}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </Show>

      <Show when={history.length > 0}>
        <div class="preview-rest-history">
          <div class="preview-rest-history-title">History</div>
          <For each={history}>
            {(entry) => (
              <button
                class="preview-rest-history-item"
                onClick={() => {
                  setMethod(entry.method)
                  setUrl(entry.url)
                }}
              >
                <span class="preview-rest-history-method">{entry.method}</span>
                <span class="preview-rest-history-url">{entry.url}</span>
                <span class="preview-rest-history-status" style={{ color: statusColor(entry.status) }}>
                  {entry.status}
                </span>
                <span class="preview-rest-history-time">{entry.time}ms</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
