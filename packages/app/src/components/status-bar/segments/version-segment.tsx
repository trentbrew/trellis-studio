import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"

export function VersionSegment() {
  const language = useLanguage()
  const server = useServer()
  const version = () => server.version
  const title = () => {
    const v = version()
    if (!v) return language.t("statusBar.version.tipPending")
    return language.t("statusBar.version.tip", { version: v })
  }

  return (
    <div class="flex items-center gap-1 px-1.5 py-0.5 w-fit" title={title()}>
      <span class="uppercase tracking-wider opacity-40 font-semibold text-[9px]">tc</span>
      <Show when={version()} fallback={<span class="text-[11px] font-medium opacity-35">…</span>}>
        {(v) => <span class="text-[11px] tabular-nums font-medium opacity-50">v{v()}</span>}
      </Show>
    </div>
  )
}
