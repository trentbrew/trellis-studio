import type { BackgroundJob } from "@/context/active-task"
import { Show } from "solid-js"
import { JOB_COLOR } from "./colors"

type Props = {
  progress: number | undefined
  type: BackgroundJob["type"]
  visible: boolean
}

export function ProgressPill(props: Props) {
  const color = () => JOB_COLOR[props.type]
  const width = () => `${props.progress ?? 0}%`
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  return (
    <Show when={props.visible}>
      <div
        class="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden"
        style={{ "border-radius": "0 0 12px 12px" }}
      >
        <div
          class="h-full"
          style={{
            background: color(),
            width: width(),
            transition: reducedMotion ? "none" : "width 300ms cubic-bezier(0.65, 0, 0.35, 1)",
          }}
        />
      </div>
    </Show>
  )
}
