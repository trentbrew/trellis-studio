import { Popover } from "@opencode-ai/ui/popover"
import { createSignal, lazy, Show, Suspense } from "solid-js"
import { useActiveTaskOptional } from "@/context/active-task"

const JobsPopover = lazy(() => import("../popovers/jobs-popover").then((x) => ({ default: x.JobsPopover })))

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function ActivitySegment() {
  const task = useActiveTaskOptional()
  const [shown, setShown] = createSignal(false)

  const activeJobs = () => task?.jobs().filter((j) => j.status === "running" || j.status === "queued") ?? []
  const currentJob = () => activeJobs()[0]
  const jobCount = () => activeJobs().length
  const hasJobs = () => jobCount() > 0
  const label = () => (hasJobs() ? (currentJob()?.label ?? "Working...") : "ready")

  return (
    <Show when={task}>
      <Popover
        open={shown()}
        onOpenChange={setShown}
        placement="bottom-start"
        gutter={4}
        class="[&_[data-slot=popover-body]]:p-0 w-[320px] bg-transparent border-0 shadow-none rounded-xl"
        trigger={
          <div class="flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer hover:bg-[rgba(255,255,255,0.06)] transition-colors">
            <Show when={hasJobs()} fallback={<span class="shrink-0 text-text-weak text-[10px] leading-none">●</span>}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class={reducedMotion ? "" : "animate-spin"}
                style={{ color: "var(--text-success)", "animation-duration": "1.5s" }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </Show>
            <Show when={jobCount() > 1}>
              <span
                class="text-[10px] font-semibold px-1 py-px rounded-full"
                style={{ background: "rgba(59,130,246,0.2)", color: "rgb(59,130,246)" }}
              >
                {jobCount()}
              </span>
            </Show>
            <span class="opacity-70 max-w-[120px] truncate">{label()}</span>
          </div>
        }
      >
        <Show when={shown() && hasJobs()}>
          <Suspense fallback={<div class="w-[320px] h-20 rounded-xl bg-background-strong" />}>
            <JobsPopover />
          </Suspense>
        </Show>
      </Popover>
    </Show>
  )
}
