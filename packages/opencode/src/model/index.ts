import type { Adapter, Config, Info, Provider, Status } from "./types"
import { ADAPTERS, adapter } from "./adapters"

export * from "./types"
export { ADAPTERS, adapter } from "./adapters"

export namespace Model {
  export const DEFAULTS: Config = { max: 512, temp: 0.7, topk: 40, topp: 0.95, think: 2048 }

  export const IDLE: Status = { state: "disconnected", load: 0, ram: 0, sessions: 0, warm: false }

  /**
   * Probe every known backend. We only ever check whether a server is already
   * running — starting a second model process is never our call to make.
   */
  export async function detect(list: Adapter[] = ADAPTERS): Promise<Info[]> {
    return Promise.all(
      list.map(async (x) => ({
        id: x.id,
        name: x.name,
        platform: x.platform,
        endpoint: x.endpoint,
        available: await x.probe().catch(() => false),
      })),
    )
  }

  /**
   * Pick a backend and connect to it. `prefer` wins when it is available,
   * otherwise the first available adapter in preference order is used.
   *
   * Connecting also warms the weights unless `warm` is false. Backends that
   * evict on idle would otherwise charge the user a multi-second load on their
   * first prompt; paying it here keeps time-to-first-token sub-second.
   */
  export async function connect(prefer?: string, list: Adapter[] = ADAPTERS, warm = true) {
    const found = await detect(list)
    const pick =
      (prefer ? found.find((x) => x.id === prefer && x.available) : undefined) ?? found.find((x) => x.available)
    if (!pick) throw new Error(unavailable(found))

    const target = adapter(pick.id) ?? list.find((x) => x.id === pick.id)
    if (!target) throw new Error(`Unknown backend: ${pick.id}`)

    const provider = target.create()
    const status = await provider.init()
    if (status.state === "error") throw new Error(`${pick.name}: ${status.error ?? "failed to connect"}`)
    if (warm) await provider.warm()
    return { provider, backend: pick }
  }

  export function unavailable(found: Info[]) {
    const help = found.map((x) => `  ${x.name} (${x.platform}) — ${x.endpoint}`).join("\n")
    return `No model backend is running.\n\nStart one of:\n${help}`
  }

  /** A selector that survives re-detection, for UIs that poll while disconnected. */
  export function selector(list: Adapter[] = ADAPTERS) {
    let provider: Provider | undefined
    let backend: Info | undefined

    return {
      get provider() {
        return provider
      },
      get backend() {
        return backend
      },
      status() {
        return provider?.status() ?? IDLE
      },
      async select(prefer?: string, warm = true) {
        if (provider && backend && (!prefer || prefer === backend.id)) return { provider, backend }
        const next = await connect(prefer, list, warm)
        provider = next.provider
        backend = next.backend
        return next
      },
      async redetect() {
        await provider?.shutdown()
        provider = undefined
        backend = undefined
        return detect(list)
      },
    }
  }
}
