import { Show } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useTerminalOptional } from "@/context/terminal"
import { useLayout } from "@/context/layout"
import { focusTerminalById } from "@/pages/session/helpers"

export function TerminalCountSegment(props: {
  variant?: "default" | "rail" | "titlebar"
  tooltipPlacement?: "bottom" | "right" | "top"
}) {
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

  if (props.variant === "rail" || props.variant === "titlebar") {
    const compact = props.variant === "titlebar"
    return (
      <div class="relative shrink-0">
        <Tooltip placement={props.tooltipPlacement ?? (compact ? "bottom" : "right")} value={tooltip()}>
          <button
            type="button"
            data-action="terminal-toggle"
            class="flex items-center justify-center rounded-md transition-colors"
            classList={{
              "h-6 w-7 rounded-full border border-border-base/40 bg-surface-base/60": compact,
              "h-9 w-12 md:size-9 md:w-9 md:min-w-0 md:px-0 [&_svg]:size-4 md:[&_svg]:size-[18px]": !compact,
              "bg-surface-raised-stronger-non-alpha text-text-strong shadow-sm ring-1 ring-inset ring-border-strong-base/70":
                opened() && !compact,
              "bg-surface-raised-base text-text-base shadow-[0_0_0_1px_var(--border-base)]": opened() && compact,
              "text-text-weak hover:text-text-base hover:bg-surface-raised-base/50": !opened() && !compact,
              "text-icon-weak hover:text-icon-base": !opened() && compact,
            }}
            onClick={toggle}
            aria-label={tooltip()}
            aria-pressed={opened()}
          >
            <Icon name="terminal" size="small" class={compact ? "shrink-0" : "md:!size-[18px]"} />
          </button>
        </Tooltip>
        <Show when={count() > 0}>
          <span
            class="absolute flex items-center justify-center rounded-full px-1 tabular-nums pointer-events-none"
            classList={{
              "-top-0.5 -right-0.5 min-w-4 h-4 text-[9px] font-medium leading-none text-text-strong bg-surface-raised-base border border-border-base/40":
                compact,
              "-top-1 -right-1 min-w-[15px] h-[15px] text-[9px] font-bold ring-2 ring-surface-raised-base bg-surface-raised-base text-text-strong border border-border-base/40":
                !compact,
            }}
          >
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
        variant={opened() ? "primary" : "ghost"}
        class="w-6 h-6 shrink-0"
        data-action="terminal-toggle"
        title={tooltip()}
        onClick={toggle}
        aria-label={tooltip()}
        aria-pressed={opened()}
      />
      <Show when={count() > 0}>
        <span class="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 inline-flex items-center justify-center rounded-full text-[9px] font-medium leading-none text-text-strong bg-surface-raised-base border border-border-base/40 tabular-nums">
          {count()}
        </span>
      </Show>
    </div>
  )
}
