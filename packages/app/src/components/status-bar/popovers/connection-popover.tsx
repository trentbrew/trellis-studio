import { useServer } from "@/context/server"

export function ConnectionPopover() {
  const server = useServer()
  const current = () => server.current
  const healthy = () => server.healthy()

  const statusColor = () => {
    if (healthy() === true) return "var(--icon-success)"
    if (healthy() === false) return "var(--icon-error)"
    return "var(--text-weak)"
  }

  const statusLabel = () => {
    if (healthy() === true) return "Connected"
    if (healthy() === false) return "Disconnected"
    return "Connecting..."
  }

  return (
    <div
      class="rounded-xl shadow-[var(--shadow-lg-border-base)] p-3 text-[12px] space-y-2"
      style={{ background: "var(--background-strong)" }}
    >
      <div class="font-semibold opacity-60 text-[10px] uppercase tracking-wide">Server</div>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor() }} />
          <span class="truncate opacity-80">{current()?.displayName ?? "Default"}</span>
        </div>
        <span class="text-[11px] shrink-0" style={{ color: statusColor() }}>
          {statusLabel()}
        </span>
      </div>
      <div class="opacity-40 text-[11px] truncate">{current()?.http.url ?? "—"}</div>
    </div>
  )
}
