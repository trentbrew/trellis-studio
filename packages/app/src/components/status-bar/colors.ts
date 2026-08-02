import type { BackgroundJob } from "@/context/active-task"

export const PRIORITY_COLOR: Record<string, string> = {
  critical: "rgb(239, 68, 68)",
  high: "rgb(249, 115, 22)",
  medium: "rgb(234, 179, 8)",
  low: "rgb(34, 197, 94)",
}

export const JOB_COLOR: Record<BackgroundJob["type"], string> = {
  sync: "rgb(34, 197, 94)",
  generate: "rgb(59, 130, 246)",
  index: "rgb(245, 158, 11)",
  criteria: "rgb(168, 85, 247)",
}

export function healthColor(h: number) {
  if (h >= 0.8) return "var(--icon-success)"
  if (h >= 0.5) return "var(--icon-warning)"
  return "var(--icon-error)"
}
