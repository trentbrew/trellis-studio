import type { Event } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { type Accessor, createEffect, createMemo, onCleanup } from "solid-js"
import { useGlobalSDK } from "./global-sdk"

type SDKEventMap = {
  [key in Event["type"]]: Extract<Event, { type: key }>
}

export const { use: useSDK, provider: SDKProvider } = createSimpleContext({
  name: "SDK",
  init: (props: { directory: Accessor<string> }) => {
    const globalSDK = useGlobalSDK()

    const directory = createMemo(props.directory)
    const client = createMemo(() =>
      globalSDK.createClient({
        directory: directory(),
        throwOnError: true,
      }),
    )

    const emitter = createGlobalEmitter<SDKEventMap>()

    createEffect(() => {
      const unsub = globalSDK.event.on(directory(), (event) => {
        emitter.emit(event.type, event)
      })
      onCleanup(unsub)
    })

    const fetch: typeof globalSDK.fetch = (input, init) => {
      const dir = directory()
      const headers = new Headers(init?.headers)
      if (dir && !headers.has("x-opencode-directory")) {
        headers.set("x-opencode-directory", encodeURIComponent(dir))
      }
      if (input instanceof Request) {
        return globalSDK.fetch(
          new Request(input, {
            ...init,
            headers: new Headers([...input.headers.entries(), ...headers.entries()]),
          }),
        )
      }
      return globalSDK.fetch(input, { ...init, headers })
    }

    return {
      get directory() {
        return directory()
      },
      get client() {
        return client()
      },
      fetch,
      event: emitter,
      get url() {
        return globalSDK.url
      },
      createClient(opts: Parameters<typeof globalSDK.createClient>[0]) {
        return globalSDK.createClient(opts)
      },
    }
  },
})
