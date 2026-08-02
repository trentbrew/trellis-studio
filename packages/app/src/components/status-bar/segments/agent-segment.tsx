import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useLocalOptional } from "@/context/local"
import { useLayout } from "@/context/layout"

export function AgentSegment(props: { variant?: "default" | "rail"; tooltipPlacement?: "right" | "top" }) {
  const local = useLocalOptional()
  const layout = useLayout()
  const name = () => local?.agent.current()?.name
  const label = () => (name() ? `${name()} agent` : "Toggle agent panel")
  const opened = () => layout.session.opened()
  const toggle = () => layout.session.toggle()

  if (props.variant === "rail") {
    return (
      <Tooltip placement={props.tooltipPlacement ?? "right"} value={label()}>
        <button
          type="button"
          class="flex h-9 w-12 items-center justify-center rounded-md transition-colors md:size-9 md:w-9 md:min-w-0 md:px-0 [&_svg]:size-4 md:[&_svg]:size-[18px]"
          classList={{
            "bg-surface-raised-stronger-non-alpha text-text-strong shadow-sm ring-1 ring-inset ring-border-strong-base/70":
              opened(),
            "text-text-weak hover:text-text-base hover:bg-surface-raised-base/50": !opened(),
          }}
          onClick={toggle}
          aria-label={label()}
          aria-pressed={opened()}
        >
          <Icon name="bot" size="small" class="md:!size-[18px]" />
        </button>
      </Tooltip>
    )
  }

  return (
    <IconButton
      icon="bot"
      size="small"
      variant={opened() ? "primary" : "ghost"}
      class="w-6 h-6 rounded-full shrink-0 transition-colors"
      classList={{
        "bg-surface-raised-base text-text-base shadow-[0_0_0_1px_var(--border-base)]": opened(),
        "text-icon-weak hover:text-icon-base hover:bg-surface-base": !opened(),
      }}
      title={label()}
      onClick={toggle}
      aria-label={label()}
      aria-pressed={opened()}
    />
  )
}
