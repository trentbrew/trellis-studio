import { Popover } from "@opencode-ai/ui/popover"
import { createSignal, lazy, Show, Suspense } from "solid-js"
import { useServer } from "@/context/server"

const ConnectionPopover = lazy(() =>
  import("../popovers/connection-popover").then((x) => ({ default: x.ConnectionPopover })),
)

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function ConnectionSegment() {
  const server = useServer()
  const [shown, setShown] = createSignal(false)
  const connected = () => server.healthy() === true
  const pending = () => server.healthy() === undefined

  const dotColor = () => {
    if (pending()) return "var(--text-weak)"
    return connected() ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)"
  }

  return (
    <Popover
      open={shown()}
      onOpenChange={setShown}
      placement="bottom-start"
      gutter={4}
      class="[&_[data-slot=popover-body]]:p-0 w-[280px] bg-transparent border-0 shadow-none rounded-xl"
      trigger={
        <div class="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer hover:bg-white/5 transition-all duration-200">
          <div
            class="w-2 h-2 rounded-full shrink-0 transition-all duration-300"
            classList={{ "animate-pulse": connected() && !reducedMotion }}
            style={{ background: dotColor(), "box-shadow": connected() ? "0 0 8px rgba(34,197,94,0.35)" : undefined }}
          />
          <span class="text-[11px] font-medium opacity-70 truncate max-w-[120px]">
            {connected() ? (server.current?.http.url ?? "Server") : pending() ? "Connecting…" : "Disconnected"}
          </span>
        </div>
      }
    >
      <Show when={shown()}>
        <Suspense fallback={<div class="w-[280px] h-12 rounded-xl bg-background-strong" />}>
          <ConnectionPopover />
        </Suspense>
      </Show>
    </Popover>
  )
}
