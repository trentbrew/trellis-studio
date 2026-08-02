import { For, Show } from "solid-js"
import { useActiveTaskOptional } from "@/context/active-task"
import { ProgressPill } from "../progress-pill"

export function JobsPopover() {
  const task = useActiveTaskOptional()
  const jobs = () => task?.jobs().filter((j) => j.status !== "complete") ?? []

  return (
    <div
      class="rounded-xl shadow-[var(--shadow-lg-border-base)] p-3 text-[12px]"
      style={{ background: "var(--background-strong)" }}
    >
      <div class="font-semibold opacity-60 text-[10px] uppercase tracking-wide mb-2">Background Jobs</div>
      <Show when={jobs().length > 0} fallback={<div class="opacity-40 text-center py-2">No active jobs</div>}>
        <div class="space-y-2">
          <For each={jobs()}>
            {(job) => (
              <div
                class="relative overflow-hidden rounded-lg px-2 py-1.5"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span class="opacity-80 truncate">{job.label}</span>
                  <span
                    class="text-[10px] shrink-0"
                    style={{
                      color:
                        job.status === "error"
                          ? "var(--icon-error)"
                          : job.status === "complete"
                            ? "var(--icon-success)"
                            : "var(--text-info)",
                    }}
                  >
                    {job.status === "running" && job.progress !== undefined ? `${job.progress}%` : job.status}
                  </span>
                </div>
                <ProgressPill progress={job.progress} type={job.type} visible={job.status === "running"} />
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
