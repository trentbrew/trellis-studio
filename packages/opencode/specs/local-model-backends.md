# Local model backends

Architecture record for the local inference layer in `src/model` and the `internal:model` TUI plugin.
Supersedes the prototype ADR `001-model-backend-architecture` from the TurboFieldfare sandbox.

## Decision

Inference runs in a **separate, already-running process**. The TUI is a client that connects to it over
localhost HTTP and streams token deltas. We never load a model in the CLI process, and we never spawn a
second model server — if nothing is listening, we say so and tell the user how to start one.

This holds for every backend we support:

| Backend        | Platform                  | Endpoint                 | Health       | Wire format          |
| -------------- | ------------------------- | ------------------------ | ------------ | -------------------- |
| TurboFieldfare | macOS 26+ (Apple Silicon) | `http://127.0.0.1:8080`  | `/health`    | OpenAI SSE           |
| Ollama         | Cross-platform            | `http://127.0.0.1:11434` | `/api/tags`  | NDJSON (`/api/chat`) |
| llama.cpp      | Cross-platform            | `http://127.0.0.1:8080`  | `/v1/models` | OpenAI SSE           |

## Why

- **Model lifetime outlives the TUI.** A restart of the CLI should not cost a 30s model load. The server
  owns the weights and the KV cache; we own the conversation.
- **Crash isolation.** A tokenizer segfault takes down the server, not the editor.
- **One abstraction, three transports.** Two of the three backends speak OpenAI-compatible SSE, so the
  divergence is small and lives in one adapter each.

## Shape

```
src/model/
  types.ts      Provider, Adapter, Request, Delta, Status — no implementation
  stream.ts     lines() chunk-boundary-safe splitter, json(), reachable()
  openai.ts     shared client for OpenAI-compatible SSE backends
  adapters.ts   TurboFieldfare / Ollama / llama.cpp, in preference order
  index.ts      Model namespace: detect, connect, selector, DEFAULTS, IDLE
```

`Adapter` is metadata plus two functions: `probe()` (is a server listening?) and `create()` (build a
`Provider` bound to an endpoint). `ADAPTERS` is ordered by preference — native first, cross-platform
after — and `Model.detect()` probes all of them in parallel.

`Provider.generate()` returns an `AsyncIterable<Delta>`. Deltas carry `first` (time-to-first-token
marker), `done`, and a monotonic `index`. Nothing buffers: the UI appends each delta as it lands.

### Sessions and KV cache

`Request.session` is a stable id per conversation. TurboFieldfare keys its prefix cache off the OpenAI
`user` field, so we forward it there. Ollama and llama.cpp derive their cache from the prompt prefix
itself, so the messages array _is_ the session and `reset()` is a no-op — sending a different history
naturally replaces the retained prefix.

### Warming

Ollama evicts idle models after 5 minutes by default. Measured on `gemma4:latest` (8B Q4_K_M, 9.9GB):

| State                       | Time to first token |
| --------------------------- | ------------------- |
| Cold (evicted)              | ~3800ms             |
| Warm (weights resident)     | ~400-500ms          |

So "instant load" is not a property of the backend — it is a property of *when* you pay the load cost.
`Provider.warm()` pays it explicitly:

- **Ollama** posts to `/api/chat` with an empty `messages` array, which loads the model and returns
  without generating, then confirms residency via `/api/ps`. Every request also carries
  `keep_alive: "2h"`, which replaces the 5-minute default and keeps the model pinned across a work
  session.
- **TurboFieldfare / llama.cpp** pin the model at their own startup, so reaching `/health` is itself
  proof of residency and `warm()` is a status assertion rather than an action.

`Model.connect()` warms by default. The cost lands behind the connecting spinner at startup instead of
on the user's first prompt. `Status.warm` drives a `warm` indicator in the status bar, and
`/model-warm` re-pins after an eviction.

`just tui` runs `script/warm-model.ts` before launching, so a TUI started from source has resident
weights by the time the model console opens. It is non-fatal — no backend means no warm, and the
console shows start instructions as usual.

### Reasoning models

`gemma4` is a thinking model. Ollama emits its reasoning as `message.thinking` with **empty**
`message.content`, and llama.cpp/TurboFieldfare use `delta.reasoning_content`. Measured on
`gemma4:latest` for the prompt "Explain what a semaphore is":

| | count | first delta |
| --- | --- | --- |
| thinking | 337 | ~600ms |
| content  | 318 | ~8600ms |

Two consequences, both of which looked like "the model is hanging":

1. **Dropping reasoning renders a blank screen.** An adapter that only forwards `content` shows nothing
   for the ~8s the model spends reasoning. `Delta.thinking` flags these so the UI streams them as
   transient status and clears them when the answer starts.
2. **Reasoning counts against `num_predict`.** With a 512-token cap, reasoning consumed all 512 and the
   answer never arrived — 467 thinking deltas, zero content. `Config.think` (default 2048) is added on
   top of `max` so the visible answer always has budget.

Thinking deltas never carry `first`; the first *visible* token opens the assistant message.

### Concurrency

Ollama serializes requests per model. Two overlapping generations against `gemma4` measured 644ms and
31779ms to first chunk — the second waited out the first entirely. This is server behavior, not
something the client can schedule around, but it explains apparent multi-minute stalls when a warm
call and a prompt overlap.

### Port collisions

TurboFieldfare and llama.cpp both default to `127.0.0.1:8080` and both answer `/v1/models`, so a bare
reachability probe reports llama.cpp as available when TurboFieldfare is what is running.
TurboFieldfare stamps `owned_by: "turbofieldfare"` on its model entries, and the llama.cpp probe treats
that as a disqualifier. Detection order means TurboFieldfare wins the port regardless; this only keeps
the reported inventory honest.

We deliberately do **not** relocate a backend to a private port to dodge this. 8080 is TurboFieldfare's
own documented default, so moving our guess would only break discovery for anyone who started the
server the documented way — and it would relocate the collision rather than resolve it, since users can
put any server on any port. Disambiguating from the response is port-independent.

Endpoints are overridable for genuinely non-standard setups:

| Variable                      | Default                    |
| ----------------------------- | -------------------------- |
| `TRELLIS_TURBOFIELDFARE_URL`  | `http://127.0.0.1:8080`    |
| `TRELLIS_OLLAMA_URL`          | `http://127.0.0.1:11434`   |
| `TRELLIS_LLAMACPP_URL`        | `http://127.0.0.1:8080`    |

An unparseable value falls back to the default rather than silently disabling detection.

### Trust modes

`fast` trusts the server's own verification (the model was validated at load or pull time). `full`
re-verifies. Today no backend exposes a re-verify hook over HTTP, so `trust` is carried through the
request and surfaced in the UI without changing behavior. When a backend gains the capability, it
changes in the adapter and nowhere else.

## TUI integration

`internal:model` (`src/cli/cmd/tui/feature-plugins/model/`) registers:

- route `model.console` — the streaming chat view
- `/model-console` — navigate to it
- `/model-detect` — probe localhost and toast what is running

The view is a **route**, not a full-screen takeover: it renders inside the studio shell alongside the
existing chrome, uses theme tokens rather than hardcoded hex, and drives its three phases —
`connecting` / `error` / `ready` — through a `Switch`. The connecting phase names the backend it found
before it commits; the error phase lists every known backend with its endpoint and offers a retry that
re-probes rather than restarting the app.

Status is polled at 500ms into a `ModelStatus` bar showing state, RAM, token count, rate, and active
session count.

## Prototype deltas

Changes made while migrating the React prototype into this Solid codebase:

- **Solid, not React.** `@opentui/react` is not a dependency here; the TUI is `@opentui/solid`. Hooks
  became signals/stores, and `<input>` became `<textarea>` with a `return` → `submit` keybinding, which
  is the pattern the rest of the TUI uses and which avoids the prototype's double-Enter bug entirely.
- **Classes became closures.** `EventEmitter` subclasses with `_status` fields collapsed into factory
  functions over a captured `Status`. No inheritance, no static-method-as-probe.
- **No singleton factory.** `ModelProviderFactory.instance` was module-global mutable state that had to
  be `reset()` in tests. `Model.selector()` returns an isolated instance instead, and `Model.detect` /
  `Model.connect` take an adapter list so tests inject fakes without touching globals.
- **Chunk-boundary-safe SSE.** The prototype's TurboFieldfare and llama.cpp adapters split each decoded
  chunk on `\n` independently, silently dropping any event that straddled a read boundary. `lines()`
  buffers the remainder. Only the Ollama adapter got this right.
- **One OpenAI client.** TurboFieldfare and llama.cpp were near-identical 180-line files; they are now
  two ~10-line adapter descriptors over `openai()`.
- **`StreamingOutput` dropped.** It re-ran generation from a `createEffect`-equivalent whose dependency
  list included its own output state — an infinite-regeneration hazard. Streaming is driven from the
  submit handler instead.
- **Detection is parallel.** The prototype awaited each probe in sequence, so three down backends cost
  three sequential 2s timeouts before showing the error screen.

## Tests

`test/model/model.test.ts` — detection order, preference and fallback, the no-backend error message,
delta ordering and first/done markers, session accounting, warm-on-connect and opt-out, warm failure
tolerance, selector reuse and redetect.
`test/model/openai.test.ts` — runs a real `Bun.serve` OpenAI-compatible server: health parsing, SSE
deltas, `[DONE]` termination, session-id forwarding, reasoning separation, unreachable-server handling.
`test/model/ollama.test.ts` — NDJSON thinking/content split, reasoning budget, `keep_alive`, warm
without generation, and the 8080 port-collision probe.
`test/cli/tui/model-plugin.test.ts` — route and slash-command registration, navigation.

No mocked `fetch` anywhere; the HTTP path is exercised against a real socket.

## Not doing

- **Bundling TurboFieldfareServer.** The binary is 16MB, but it is useless without a model: the
  `gemma4.gturbo` directory is **13GB**. Shipping that in an npm package is not viable, and the server
  is macOS/Apple-Silicon-only while the CLI is cross-platform. The HTTP contract is the integration
  surface — anything that answers `/health` and OpenAI-compatible SSE on 8080 works, whether the user
  built it from source, installed it, or runs something else entirely. If we later want a smoother
  path, the right move is a `just` recipe or doctor command that *detects and launches* a
  user-installed server, not a vendored copy of one.
- Starting or supervising model servers from the CLI. Out of scope, and it invites the double-process
  failure this design exists to prevent.
- Model selection UI. Each adapter hardcodes its model name today; that becomes config when a second
  model per backend is actually wanted.
