import { Icon, type IconProps } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"

export type SessionAgentIconProps = {
  sessionID: string
  working?: boolean
  size?: IconProps["size"]
  class?: string
}

export function SessionAgentIcon(props: SessionAgentIconProps) {
  return (
    <span
      class={`inline-flex shrink-0 size-5 items-center justify-center text-icon-weak ${props.class ?? ""}`}
      aria-hidden="true"
    >
      <Show when={props.working} fallback={<Icon name="speech-bubble" size={props.size ?? "small"} />}>
        <Icon name="circle-dashed" size={props.size ?? "small"} class="animate-spin" />
      </Show>
    </span>
  )
}
