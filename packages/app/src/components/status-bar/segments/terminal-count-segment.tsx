import { Show } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useTerminalOptional } from "@/context/terminal"
import { useLayout } from "@/context/layout"
import { focusTerminalById } from "@/pages/session/helpers"

export function TerminalCountSegment(props: { variant?: "default" | "rail"; tooltipPlacement?: "right" | "top" }) {
  const terminal = useTerminalOptional()
  const layout = useLayout()
  const command = useCommand()
  const language = useLanguage()
  const count = () => terminal?.all().length ?? 0
  const opened = () => layout.terminal.opened()
  const label = () => language.t("command.terminal.toggle")
  const tooltip = () => {
    const n = count()
    if (n === 0) return label()
    return `${label()} (${n} terminal${n !== 1 ? "s" : ""})`
  }

  const toggle = () => {
    command.trigger("terminal.toggle")
    if (layout.terminal.opened()) {
      const id = terminal?.active()
      if (id) focusTerminalById(id)
    }
  }

  if (props.variant === "rail") {
    return (
      <div class="relative shrink-0">
        <Tooltip placement={props.tooltipPlacement ?? "right"} value={tooltip()}>
          <button
            type="button"
            data-action="rail-terminal-toggle"
            class="flex h-9 w-12 items-center justify-center rounded-md transition-colors md:size-9 md:w-9 md:min-w-0 md:px-0 [&_svg]:size-4 md:[&_svg]:size-[18px]"
            classList={{
              "bg-surface-raised-stronger-non-alpha text-text-strong shadow-sm ring-1 ring-inset ring-border-strong-base/70":
                opened(),
              "text-text-weak hover:text-text-base hover:bg-surface-raised-base/50": !opened(),
            }}
            onClick={toggle}
            aria-label={tooltip()}
            aria-pressed={opened()}
          >
            <Icon name="terminal" size="small" class="md:!size-[18px]" />
          </button>
        </Tooltip>
        <Show when={count() > 0}>
          <span class="absolute -top-1 -right-1 min-w-[15px] h-[15px] flex items-center justify-center text-[9px] font-bold rounded-full px-1 tabular-nums ring-2 ring-surface-raised-base bg-surface-raised-base text-text-strong border border-border-base/40 pointer-events-none">
            {count() > 9 ? "9+" : count()}
          </span>
        </Show>
      </div>
    )
  }

  return (
    <div class="relative shrink-0">
      <IconButton
        icon="terminal"
        size="small"
        variant="ghost"
        class="w-6 h-6 shrink-0"
        title={tooltip()}
        onClick={toggle}
        aria-label={tooltip()}
      />
      <Show when={count() > 0}>
        <span class="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 inline-flex items-center justify-center rounded-full text-[9px] font-medium leading-none text-text-strong bg-surface-raised-base border border-border-base/40 tabular-nums">
          {count()}
        </span>
      </Show>
    </div>
  )
}
