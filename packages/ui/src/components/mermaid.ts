let seq = 0

// mermaid v11 is not concurrent-safe — serialize all renders
let queue = Promise.resolve()

// Persistent off-screen container to avoid DOM thrashing
let offscreenHost: HTMLDivElement | null = null

function getHost() {
  if (!offscreenHost) {
    offscreenHost = document.createElement("div")
    offscreenHost.style.cssText =
      "visibility:hidden;position:fixed;top:-9999px;left:-9999px;width:0;height:0;overflow:hidden;"
    document.body.appendChild(offscreenHost)
  }
  return offscreenHost
}

async function load() {
  const mod = await import("mermaid")
  return mod.default
}

let instance: ReturnType<typeof load> | undefined

function get() {
  if (!instance) instance = load()
  return instance
}

export async function init(dark: boolean) {
  const mermaid = await get()
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? "dark" : "default",
    fontFamily: "inherit",
    securityLevel: "loose",
  })
}

export function render(code: string, dark: boolean): Promise<string> {
  const result = queue
    .then(async () => {
      const mermaid = await get()
      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? "dark" : "default",
        fontFamily: "inherit",
        securityLevel: "loose",
      })
      const id = `mermaid-${++seq}`
      const { svg } = await mermaid.render(id, code, getHost())
      return svg
    })
    .catch((err) => {
      throw err
    })
  // Swallow rejections on the queue chain so one failure doesn't block the rest
  queue = result.then(
    () => {},
    () => {},
  )
  return result
}
