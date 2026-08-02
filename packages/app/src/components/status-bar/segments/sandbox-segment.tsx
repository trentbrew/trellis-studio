import { Popover } from "@opencode-ai/ui/popover"
import { createMemo, createSignal, Show } from "solid-js"
import { createCloudSandbox, type CloudSandboxStatus } from "@/context/cloud-sandbox"
import { useLanguage } from "@/context/language"

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

function label(status: CloudSandboxStatus) {
  if (status.runtime === "paused" || status.lifecycle === "paused") return "Paused"
  if (status.lifecycle === "provisioning") return "Starting"
  if (status.lifecycle === "resuming") return "Resuming"
  if (status.lifecycle === "failed") return "Failed"
  if (status.warmth === "hot") return "Hot"
  if (status.warmth === "warm") return "Warm"
  return "Cold"
}

function dotStyle(status: CloudSandboxStatus) {
  if (status.lifecycle === "failed") {
    return { background: "rgb(239, 68, 68)", shadow: undefined }
  }
  if (status.runtime === "paused" || status.warmth === "cold") {
    return { background: "rgb(148, 163, 184)", shadow: undefined }
  }
  if (status.warmth === "warm" || status.lifecycle === "provisioning" || status.lifecycle === "resuming") {
    return { background: "rgb(251, 191, 36)", shadow: "0 0 8px rgba(251,191,36,0.35)" }
  }
  return { background: "rgb(34, 197, 94)", shadow: "0 0 8px rgba(34,197,94,0.35)" }
}

function lifecycleDetail(status: CloudSandboxStatus) {
  switch (status.lifecycle) {
    case "provisioning":
      return "Provisioning your cloud workspace."
    case "resuming":
      return "Waking the sandbox from pause."
    case "failed":
      return "Sandbox provisioning failed. Try resume from Trellis Cloud."
    case "ready":
      return status.studioReachable
        ? "Studio is reachable inside the sandbox."
        : "Sandbox is running; studio is still starting."
    default:
      return "Waiting for sandbox status from Trellis Cloud."
  }
}

export function SandboxSegment() {
  const language = useLanguage()
  const cloud = createCloudSandbox()
  const [shown, setShown] = createSignal(false)
  const status = () => cloud.status()
  const title = createMemo(() => label(status()))
  const style = createMemo(() => dotStyle(status()))
  const pulse = createMemo(() => {
    const s = status()
    if (reducedMotion) return false
    return s.warmth === "hot" || s.warmth === "warm" || s.lifecycle === "provisioning" || s.lifecycle === "resuming"
  })

  return (
    <Show when={cloud.active}>
      <Popover
        open={shown()}
        onOpenChange={setShown}
        placement="top-end"
        gutter={4}
        class="[&_[data-slot=popover-body]]:p-0 w-[280px] bg-transparent border-0 shadow-none rounded-xl"
        trigger={
          <button
            type="button"
            class="h-6 flex items-center gap-1.5 rounded-md px-2 text-[11px] hover:bg-white/5 transition-all duration-200 shrink-0"
            title={language.t("statusBar.sandbox.tip")}
          >
            <div
              class="w-2 h-2 rounded-full shrink-0 transition-all duration-300"
              classList={{ "animate-pulse": pulse() }}
              style={{ background: style().background, "box-shadow": style().shadow }}
            />
            <span class="uppercase tracking-wider opacity-40 font-semibold text-[9px]">VM</span>
            <span class="font-medium opacity-80">{title()}</span>
          </button>
        }
      >
        <Show when={shown()}>
          <div
            class="rounded-xl shadow-[var(--shadow-lg-border-base)] p-3 text-[12px] space-y-2"
            style={{ background: "var(--background-strong)" }}
          >
            <div class="font-semibold opacity-70 text-[10px] uppercase tracking-wide">
              {language.t("statusBar.sandbox.title")}
            </div>
            <div class="flex justify-between gap-4 text-[11px]">
              <span class="opacity-55">{language.t("statusBar.sandbox.state")}</span>
              <span class="font-medium">{title()}</span>
            </div>
            <div class="flex justify-between gap-4 text-[11px]">
              <span class="opacity-55">{language.t("statusBar.sandbox.runtime")}</span>
              <span class="font-medium capitalize">{status().runtime}</span>
            </div>
            <div class="flex justify-between gap-4 text-[11px]">
              <span class="opacity-55">{language.t("statusBar.sandbox.lifecycle")}</span>
              <span class="font-medium capitalize">{status().lifecycle}</span>
            </div>
            <div class="text-[10px] leading-4 opacity-45 border-t border-white/10 pt-2">
              {lifecycleDetail(status())}
            </div>
            <div class="text-[10px] leading-4 opacity-45">
              {language.t("statusBar.sandbox.costNote")}
            </div>
          </div>
        </Show>
      </Popover>
    </Show>
  )
}
