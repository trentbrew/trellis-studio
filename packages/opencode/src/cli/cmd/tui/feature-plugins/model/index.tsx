import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { Model } from "@/model"
import { ModelView } from "./view"

/**
 * Local model console. Connects to an already-running inference server
 * (TurboFieldfare on macOS, Ollama, or llama.cpp) and streams token deltas
 * into a studio route — the model never loads in this process.
 */
const id = "internal:model"
const route = "model.console"

const tui: TuiPlugin = async (api) => {
  api.route.register([{ name: route, render: () => <ModelView api={api} /> }])

  api.command.register(() => [
    {
      title: "Model console",
      value: "model.console",
      description: "Chat with a local model backend (TurboFieldfare, Ollama, llama.cpp)",
      category: "Model",
      slash: { name: "model-console" },
      onSelect() {
        api.ui.dialog.clear()
        api.route.navigate(route)
      },
    },
    {
      title: "Warm model",
      value: "model.warm",
      description: "Preload weights and pin them in memory so the next prompt is instant",
      category: "Model",
      slash: { name: "model-warm" },
      async onSelect() {
        api.ui.dialog.clear()
        const start = Date.now()
        const { provider, backend } = await Model.connect().catch((err: unknown) => {
          api.ui.toast({ variant: "error", title: "No backend running", message: String(err) })
          throw err
        })
        const status = provider.status()
        api.ui.toast({
          title: status.warm ? `${backend.name} warm` : `${backend.name} could not be warmed`,
          message: status.warm ? `weights resident in ${Date.now() - start}ms` : (status.error ?? "unknown"),
        })
      },
    },
    {
      title: "Model backends",
      value: "model.detect",
      description: "Probe localhost for running inference servers",
      category: "Model",
      slash: { name: "model-detect" },
      async onSelect() {
        api.ui.dialog.clear()
        const found = await Model.detect()
        const live = found.filter((x) => x.available)
        api.ui.toast({
          title: live.length ? `${live.length} backend${live.length > 1 ? "s" : ""} running` : "No backend running",
          message: live.length
            ? live.map((x) => `${x.name} — ${x.endpoint}`).join(", ")
            : found.map((x) => x.name).join(", ") + " all unreachable",
        })
      },
    },
  ])
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
