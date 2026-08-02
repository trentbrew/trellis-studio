import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Popover } from "@opencode-ai/ui/popover"
import { Suspense, createMemo, createSignal, lazy, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { useSyncOptional } from "@/context/sync"

const Body = lazy(() => import("../../status-popover-body").then((x) => ({ default: x.StatusPopoverBody })))

export function StatusSegment() {
  const language = useLanguage()
  const server = useServer()
  const sync = useSyncOptional()
  const [shown, setShown] = createSignal(false)
  const ready = createMemo(() => server.healthy() === false || (sync?.data.mcp_ready ?? false))
  const healthy = createMemo(() => {
    const serverHealthy = server.healthy() === true
    const mcp = Object.values(sync?.data.mcp ?? {})
    const issue = mcp.some((item: { status: string }) => item.status !== "connected" && item.status !== "disabled")
    return serverHealthy && !issue
  })

  return (
    <Popover
      open={shown()}
      onOpenChange={setShown}
      placement="bottom-end"
      gutter={4}
      class="[&_[data-slot=popover-body]]:p-0 w-[360px] max-w-[calc(100vw-40px)] bg-transparent border-0 shadow-none rounded-xl"
      trigger={
        <Button
          variant="ghost"
          class="w-6 h-6 p-0 rounded-md shrink-0 relative"
          title={language.t("status.popover.trigger")}
        >
          <div class="relative size-4">
            <div class="badge-mask-tight size-4 flex items-center justify-center">
              <Icon name={shown() ? "status-active" : "status"} size="small" />
            </div>
            <div
              classList={{
                "absolute -top-px -right-px size-1.5 rounded-full": true,
                "bg-icon-success-base": ready() && healthy(),
                "bg-icon-critical-base": server.healthy() === false || (ready() && !healthy()),
                "bg-border-weak-base": server.healthy() === undefined || !ready(),
              }}
            />
          </div>
        </Button>
      }
    >
      <Show when={shown()}>
        <Suspense
          fallback={
            <div class="w-[360px] h-14 rounded-xl bg-background-strong shadow-[var(--shadow-lg-border-base)]" />
          }
        >
          <Body shown={shown} />
        </Suspense>
      </Show>
    </Popover>
  )
}
