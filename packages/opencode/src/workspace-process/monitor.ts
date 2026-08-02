import { Instance } from "@/project/instance"
import { Log } from "@/util/log"
import { POLL_INTERVAL_MS } from "./types"
import { syncWorkspaceListeners } from "./sync"

const log = Log.create({ service: "workspace-process" })

type MonitorState = {
  timer?: ReturnType<typeof setInterval>
  running: boolean
}

const monitor = Instance.state(
  () => ({ timer: undefined, running: false }) as MonitorState,
  async (state) => {
    if (state.timer) clearInterval(state.timer)
  },
)

export function startMonitor() {
  const state = monitor()
  if (state.timer) return

  const tick = Instance.bind(async () => {
    try {
      await syncWorkspaceListeners(Instance.directory)
    } catch (error) {
      log.warn("listener poll failed", { error })
    }
  })

  state.running = true
  void tick()
  state.timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
  state.timer.unref?.()
}

export async function refreshListeners() {
  return syncWorkspaceListeners(Instance.directory)
}
